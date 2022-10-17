import { Injectable, Scope } from 'graphql-modules';
import type { Schema, Project, Target, SingleSchema } from './../../../../shared/entities';
import { SingleSchemaModel, GraphQLDocumentStringInvalidError } from '../../../../shared/entities';
import { HiveError } from '../../../../shared/errors';
import { SingleOrchestrator } from '../orchestrators/single';
import type { CheckInput, PublishInput, DeleteInput } from '../schema-publisher';
import { SchemaValidator } from './../schema-validator';
import { SchemaManager } from '../schema-manager';
import { ensureSchemaWithSDL, SchemaHelper } from '../schema-helper';
import { temp, Conclusion } from './shared';

@Injectable({
  scope: Scope.Operation,
})
export class SingleModel {
  constructor(
    private schemaManager: SchemaManager,
    private schemaValidator: SchemaValidator,
    private orchestrator: SingleOrchestrator,
    private helper: SchemaHelper
  ) {}

  async check({
    input,
    project,
    currentSchemas,
    acceptBreakingChanges,
  }: {
    project: Project;
    input: CheckInput;
    acceptBreakingChanges: boolean;
    currentSchemas: Schema[];
  }) {
    const baseSchema = await this.schemaManager.getBaseSchema({
      organization: input.organization,
      project: input.project,
      target: input.target,
    });

    if (currentSchemas.length > 1) {
      throw new Error('Single-schema project can only have a single schema');
    }

    const existing = currentSchemas.length === 1 ? ensureSchemaWithSDL(currentSchemas[0]) : null;
    const existingObject = existing ? this.helper.createSchemaObject(SingleSchemaModel.parse(existing)) : null;

    const incoming: SingleSchema = {
      id: temp,
      author: temp,
      commit: temp,
      target: input.target,
      date: Date.now(),
      sdl: input.sdl,
      action: 'N/A',
    };
    const incomingObject = this.helper.createSchemaObject(incoming);

    const isInitial = existing === null;

    const validationResult = await this.schemaValidator.validate({
      orchestrator: this.orchestrator,
      isInitial,
      compare: {
        incoming: incomingObject,
        existing: existingObject,
      },
      schemas: {
        baseSchema,
        before: existingObject ? [existingObject] : [],
        after: [incomingObject],
      },
      selector: {
        organization: input.organization,
        project: input.project,
        target: input.target,
      },
      acceptBreakingChanges,
      project,
    });

    return {
      validationResult,
      isInitial,
      artifacts: {
        schema: {
          before: existing,
          after: incoming,
        },
      },
    };
  }

  async publish({
    input,
    project,
    target,
    currentSchemas,
    version,
  }: {
    input: PublishInput;
    project: Project;
    target: Target;
    currentSchemas: Schema[];
    version: string | null;
  }) {
    const { validationResult, isInitial, artifacts } = await this.check({
      input: {
        organization: input.organization,
        project: input.project,
        target: input.target,
        sdl: input.sdl,
      },
      // Decide if we should accept breaking changes or not
      acceptBreakingChanges: input.experimental_acceptBreakingChanges === true || !project.isUsingLegacyRegistryModel,
      project,
      currentSchemas,
    }).catch(async error => {
      if (error instanceof GraphQLDocumentStringInvalidError) {
        throw new HiveError(error.message);
      }
      throw error;
    });

    const incoming: SingleSchema = {
      id: temp,
      author: input.author,
      sdl: input.sdl,
      commit: input.commit,
      target: target.id,
      date: Date.now(),
      metadata: this.helper.ensureJSONMetadata(input.metadata),
      action: 'N/A',
    };

    const schema = {
      before: artifacts.schema.before,
      after: incoming,
    };

    const { changes, errors, isComposable, hasBreakingChanges } = validationResult;

    const hasNewUrl = false;
    const hasSchemaChanges = changes.length > 0;
    const hasErrors = errors.length > 0;
    const isForced = input.force === true;
    let hasDifferentChecksum = false;

    if (!!version && !!schema.before) {
      hasDifferentChecksum = this.helper.createChecksum(schema.before) !== this.helper.createChecksum(incoming);
    }

    const isModified = hasNewUrl || hasSchemaChanges || hasErrors || hasDifferentChecksum;

    if (!isModified && !isInitial) {
      return {
        conclusion: Conclusion.Neutral as const,
        valid: isComposable,
        isComposable,
        isInitial,
        isModified,
      };
    }

    if (project.isUsingLegacyRegistryModel) {
      const valid = isComposable && !hasBreakingChanges;
      const conclusion = valid || isForced ? Conclusion.Publish : Conclusion.Reject;
      const __typename =
        conclusion === Conclusion.Publish ? ('SchemaPublishSuccess' as const) : ('SchemaPublishError' as const);

      return {
        __typename,
        conclusion,
        isComposable: valid,
        changes,
        errors,
        updates: [], // TODO: updates
        schema: {
          before: schema.before,
          after: schema.after,
        },
        schemas: {
          before: schema.before ? [schema.before] : [],
          after: [schema.after],
        },
        cdn: valid
          ? {
              schemas: [schema.after],
              supergraph: null,
            }
          : null,
        isInitial,
      };
    }

    const conclusion = isComposable ? Conclusion.Publish : Conclusion.Reject;
    const __typename =
      conclusion === Conclusion.Publish ? ('SchemaPublishSuccess' as const) : ('SchemaPublishError' as const);

    return {
      __typename,
      conclusion,
      isComposable,
      changes,
      errors,
      updates: [],
      schema: {
        before: schema.before,
        after: schema.after,
      },
      schemas: {
        before: schema.before ? [schema.before] : [],
        after: [schema.after],
      },
      cdn:
        conclusion === Conclusion.Publish
          ? {
              schemas: [schema.after],
              supergraph: null,
            }
          : null,
      isInitial,
    };
  }

  async delete(_: { project: Project; input: DeleteInput; currentSchemas: Schema[] }) {
    throw new HiveError('Deleting schemas is not supported for single-schema projects');
  }
}
