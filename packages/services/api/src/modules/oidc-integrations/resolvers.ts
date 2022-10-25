import { OrganizationManager } from '../organization/providers/organization-manager';
import { OIDCIntegrationsProvider } from './providers/oidc-integrations.provider';
import { OIDC_INTEGRATIONS_ENABLED } from './providers/tokens';
import { OidcIntegrationsModule } from './__generated__/types';

export const resolvers: OidcIntegrationsModule.Resolvers = {
  Query: {
    isOIDCIntegrationFeatureEnabled: (_, __, { injector }) => {
      return injector.get(OIDC_INTEGRATIONS_ENABLED);
    },
  },
  Mutation: {
    createOIDCIntegration: async (_, { input }, { injector }) => {
      const oktaIntegrationsProvider = injector.get(OIDCIntegrationsProvider);
      const result = await oktaIntegrationsProvider.createOIDCIntegrationForOrganization({
        organizationId: input.organizationId,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        domain: input.domain,
      });

      if (result.type === 'ok') {
        const organization = await injector
          .get(OrganizationManager)
          .getOrganization({ organization: input.organizationId });

        return {
          ok: {
            createdOIDCIntegration: result.oidcIntegration,
            organization,
          },
        };
      }

      return {
        error: {
          message: 'Failed to create OIDC Integration.',
          details: {
            clientId: result.fieldErrors.clientId,
            clientSecret: result.fieldErrors.clientSecret,
            domain: result.fieldErrors.domain,
          },
        },
      };
    },
    updateOIDCIntegration: async (_, { input }, { injector }) => {
      const oktaIntegrationsProvider = injector.get(OIDCIntegrationsProvider);
      const result = await oktaIntegrationsProvider.updateOIDCIntegration({
        oidcIntegrationId: input.oidcIntegrationId,
        clientId: input.clientId ?? null,
        clientSecret: input.clientSecret ?? null,
        domain: input.domain ?? null,
      });

      if (result.type === 'ok') {
        return {
          ok: {
            updatedOIDCIntegration: result.oidcIntegration,
          },
        };
      }

      return {
        error: {
          message: result.message,
          details: {
            clientId: result.fieldErrors.clientId,
            clientSecret: result.fieldErrors.clientSecret,
            domain: result.fieldErrors.domain,
          },
        },
      };
    },
    deleteOIDCIntegration: async (_, { input }, { injector }) => {
      const result = await injector
        .get(OIDCIntegrationsProvider)
        .deleteOIDCIntegration({ oidcIntegrationId: input.oidcIntegrationId });

      if (result.type === 'ok') {
        return {
          ok: {
            organization: await injector
              .get(OrganizationManager)
              .getOrganization({ organization: result.organizationId }),
          },
        };
      }

      return {
        error: {
          message: result.message,
        },
      };
    },
  },
  Organization: {
    oidcIntegration: async (organization, _, { injector }) => {
      if (injector.get(OIDCIntegrationsProvider).isEnabled() === false) {
        return null;
      }

      return await injector
        .get(OIDCIntegrationsProvider)
        .getOIDCIntegrationForOrganization({ organizationId: organization.id });
    },
  },
  OIDCIntegration: {
    id: oidcIntegration => oidcIntegration.id,
    domain: oidcIntegration => oidcIntegration.domain,
    clientId: oidcIntegration => oidcIntegration.clientId,
    clientSecretPreview: (oidcIntegration, _, { injector }) =>
      injector.get(OIDCIntegrationsProvider).getClientSecretPreview(oidcIntegration),
  },
};
