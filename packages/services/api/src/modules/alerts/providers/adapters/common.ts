import type * as Types from '../../../../__generated__/types';
import { Alert, AlertChannel, Organization, Project, Target, RegistryVersion } from '../../../../shared/entities';

export interface SchemaChangeNotificationInput {
  event: {
    organization: Pick<Organization, 'id' | 'cleanId' | 'name'>;
    project: Pick<Project, 'id' | 'cleanId' | 'name'>;
    target: Pick<Target, 'id' | 'cleanId' | 'name'>;
    schema: Pick<RegistryVersion, 'id' | 'commit' | 'isComposable'> & {
      /**
       * @deprecated use isComposable instead
       */
      valid: boolean;
    };
    changes: Types.SchemaChange[];
    errors: Types.SchemaError[];
    initial: boolean;
  };
  alert: Alert;
  channel: AlertChannel;
  integrations: {
    slack: {
      token: string;
    };
  };
}

export interface ChannelConfirmationInput {
  event: {
    kind: 'created' | 'deleted';
    organization: Pick<Organization, 'id' | 'cleanId' | 'name'>;
    project: Pick<Project, 'id' | 'cleanId' | 'name'>;
  };
  channel: AlertChannel;
  integrations: {
    slack: {
      token: string;
    };
  };
}

export interface CommunicationAdapter {
  sendSchemaChangeNotification(input: SchemaChangeNotificationInput): Promise<void>;
  sendChannelConfirmation(input: ChannelConfirmationInput): Promise<void>;
}

export function slackCoderize(msg: string): string {
  return quotesTransformer(msg, '`');
}

export function quotesTransformer(msg: string, symbols = '**') {
  const findSingleQuotes = /'([^']+)'/gim;
  const findDoubleQuotes = /"([^"]+)"/gim;

  function transformm(_: string, value: string) {
    return `${symbols}${value}${symbols}`;
  }

  return msg.replace(findSingleQuotes, transformm).replace(findDoubleQuotes, transformm);
}

export function filterChangesByLevel(level: Types.CriticalityLevel) {
  return (change: Types.SchemaChange) => change.criticality === level;
}
