import type { LabModule } from './__generated__/types';
import { IdTranslator } from '../shared/providers/id-translator';
import { SchemaManager } from '../schema/providers/schema-manager';
import { ProjectManager } from '../project/providers/project-manager';
import { AuthManager } from '../auth/providers/auth-manager';
import { TargetAccessScope } from '../auth/providers/target-access';
import { SchemaHelper, isSchemaWithSDL } from '../schema/providers/schema-helper';

export const resolvers: LabModule.Resolvers = {
  Query: {
    async lab(_, { selector }, { injector }) {
      const translator = injector.get(IdTranslator);
      const [organization, project, target] = await Promise.all([
        translator.translateOrganizationId(selector),
        translator.translateProjectId(selector),
        translator.translateTargetId(selector),
      ]);

      await injector.get(AuthManager).ensureTargetAccess({
        organization: organization,
        project: project,
        target,
        scope: TargetAccessScope.REGISTRY_READ,
      });

      const schemaManager = injector.get(SchemaManager);

      const latestSchema = await schemaManager.getMaybeLatestValidVersion({
        organization,
        project,
        target,
      });

      if (!latestSchema) {
        return null;
      }

      const [schemas, projectObject] = await Promise.all([
        schemaManager.getSchemasOfVersion({
          organization,
          project,
          target,
          version: latestSchema.id,
        }),
        injector.get(ProjectManager).getProject({
          organization,
          project,
        }),
      ]);

      const orchestrator = schemaManager.matchOrchestrator(projectObject.type);
      const helper = injector.get(SchemaHelper);

      const schema = await orchestrator.build(
        schemas.filter(isSchemaWithSDL).map(s => helper.createSchemaObject(s)),
        projectObject
      );

      return {
        schema: schema.raw,
        mocks: {},
      };
    },
  },
};
