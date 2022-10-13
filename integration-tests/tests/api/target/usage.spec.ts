import { TargetAccessScope, ProjectType, ProjectAccessScope, OrganizationAccessScope } from '@app/gql/graphql';
import formatISO from 'date-fns/formatISO';
import subHours from 'date-fns/subHours';
import {
  createOrganization,
  createProject,
  createTarget,
  createToken,
  publishSchema,
  checkSchema,
  setTargetValidation,
  updateTargetValidationSettings,
  readOperationsStats,
  waitFor,
} from '../../../testkit/flow';
import { authenticate } from '../../../testkit/auth';
import { collect, CollectedOperation } from '../../../testkit/usage';
import { clickHouseQuery } from '../../../testkit/clickhouse';
// eslint-disable-next-line hive/enforce-deps-in-dev, import/no-extraneous-dependencies
import { normalizeOperation } from '@graphql-hive/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { parse, print } from 'graphql';

function ensureNumber(value: number | string): number {
  if (typeof value === 'number') {
    return value;
  }

  return parseFloat(value);
}

// eslint-disable-next-line no-process-env
const FF_CLICKHOUSE_V2_TABLES = process.env.FF_CLICKHOUSE_V2_TABLES === '1';

if (FF_CLICKHOUSE_V2_TABLES) {
  console.log('Using FF_CLICKHOUSE_V2_TABLES');
}

function sendBatch(amount: number, operation: CollectedOperation, token: string) {
  return collect({
    operations: new Array(amount).fill(operation),
    token,
  });
}

test('collect operation', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const settingsTokenResult = await createToken(
    {
      name: 'test-settings',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.Settings],
    },
    owner_access_token
  );

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(settingsTokenResult.body.errors).not.toBeDefined();
  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;
  const tokenForSettings = settingsTokenResult.body.data!.createToken.ok!.secret;

  const schemaPublishResult = await publishSchema(
    {
      author: 'Kamil',
      commit: 'abc123',
      sdl: `type Query { ping: String me: String }`,
    },
    token
  );

  expect(schemaPublishResult.body.errors).not.toBeDefined();
  expect((schemaPublishResult.body.data!.schemaPublish as any).valid).toEqual(true);

  const targetValidationResult = await setTargetValidation(
    {
      enabled: true,
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
    },
    {
      token: tokenForSettings,
    }
  );

  expect(targetValidationResult.body.errors).not.toBeDefined();
  expect(targetValidationResult.body.data!.setTargetValidation.enabled).toEqual(true);
  expect(targetValidationResult.body.data!.setTargetValidation.percentage).toEqual(0);
  expect(targetValidationResult.body.data!.setTargetValidation.period).toEqual(30);

  // should not be breaking because the field is unused
  const unusedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`,
    },
    token
  );
  expect(unusedCheckResult.body.errors).not.toBeDefined();
  expect(unusedCheckResult.body.data!.schemaCheck.__typename).toEqual('SchemaCheckSuccess');

  const collectResult = await collect({
    operations: [
      {
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token,
  });

  expect(collectResult.status).toEqual(200);

  await waitFor(5_000);

  // should be breaking because the field is used now
  const usedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`,
    },
    token
  );

  if (usedCheckResult.body.data!.schemaCheck.__typename !== 'SchemaCheckError') {
    throw new Error(`Expected SchemaCheckError, got ${usedCheckResult.body.data!.schemaCheck.__typename}`);
  }

  expect(usedCheckResult.body.data!.schemaCheck.valid).toEqual(false);

  const from = formatISO(subHours(Date.now(), 6));
  const to = formatISO(Date.now());
  const operationStatsResult = await readOperationsStats(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      period: {
        from,
        to,
      },
    },
    token
  );

  expect(operationStatsResult.body.errors).not.toBeDefined();

  const operationsStats = operationStatsResult.body.data!.operationsStats;

  expect(operationsStats.operations.nodes).toHaveLength(1);

  const op = operationsStats.operations.nodes[0];

  expect(op.count).toEqual(1);
  expect(op.document).toMatch('ping');
  expect(op.operationHash).toBeDefined();
  expect(op.duration.p75).toEqual(200);
  expect(op.duration.p90).toEqual(200);
  expect(op.duration.p95).toEqual(200);
  expect(op.duration.p99).toEqual(200);
  expect(op.kind).toEqual('query');
  expect(op.name).toMatch('ping');
  expect(op.percentage).toBeGreaterThan(99);
});

test('collect operation (legacy registry mode)', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
      useLegacyRegistryModel: true,
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const settingsTokenResult = await createToken(
    {
      name: 'test-settings',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.Settings],
    },
    owner_access_token
  );

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(settingsTokenResult.body.errors).not.toBeDefined();
  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;
  const tokenForSettings = settingsTokenResult.body.data!.createToken.ok!.secret;

  const schemaPublishResult = await publishSchema(
    {
      author: 'Kamil',
      commit: 'abc123',
      sdl: `type Query { ping: String me: String }`,
    },
    token
  );

  expect(schemaPublishResult.body.errors).not.toBeDefined();
  expect((schemaPublishResult.body.data!.schemaPublish as any).valid).toEqual(true);

  const targetValidationResult = await setTargetValidation(
    {
      enabled: true,
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
    },
    {
      token: tokenForSettings,
    }
  );

  expect(targetValidationResult.body.errors).not.toBeDefined();
  expect(targetValidationResult.body.data!.setTargetValidation.enabled).toEqual(true);
  expect(targetValidationResult.body.data!.setTargetValidation.percentage).toEqual(0);
  expect(targetValidationResult.body.data!.setTargetValidation.period).toEqual(30);

  // should not be breaking because the field is unused
  const unusedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`,
    },
    token
  );
  expect(unusedCheckResult.body.errors).not.toBeDefined();
  expect(unusedCheckResult.body.data!.schemaCheck.__typename).toEqual('SchemaCheckSuccess');

  const collectResult = await collect({
    operations: [
      {
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token,
  });

  expect(collectResult.status).toEqual(200);

  await waitFor(5_000);

  // should be breaking because the field is used now
  const usedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`,
    },
    token
  );

  if (usedCheckResult.body.data!.schemaCheck.__typename !== 'SchemaCheckError') {
    throw new Error(`Expected SchemaCheckError, got ${usedCheckResult.body.data!.schemaCheck.__typename}`);
  }

  expect(usedCheckResult.body.data!.schemaCheck.valid).toEqual(false);

  const from = formatISO(subHours(Date.now(), 6));
  const to = formatISO(Date.now());
  const operationStatsResult = await readOperationsStats(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      period: {
        from,
        to,
      },
    },
    token
  );

  expect(operationStatsResult.body.errors).not.toBeDefined();

  const operationsStats = operationStatsResult.body.data!.operationsStats;

  expect(operationsStats.operations.nodes).toHaveLength(1);

  const op = operationsStats.operations.nodes[0];

  expect(op.count).toEqual(1);
  expect(op.document).toMatch('ping');
  expect(op.operationHash).toBeDefined();
  expect(op.duration.p75).toEqual(200);
  expect(op.duration.p90).toEqual(200);
  expect(op.duration.p95).toEqual(200);
  expect(op.duration.p99).toEqual(200);
  expect(op.kind).toEqual('query');
  expect(op.name).toMatch('ping');
  expect(op.percentage).toBeGreaterThan(99);
});

test('normalize and collect operation without breaking its syntax', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const settingsTokenResult = await createToken(
    {
      name: 'test-settings',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.Settings],
    },
    owner_access_token
  );

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(settingsTokenResult.body.errors).not.toBeDefined();
  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;

  const raw_document = `
    query test {
      recs(
        input: {
          str: [{ name: "asd" }]
          aid: "asd"
          cid: "asd"
          enabled: true
          session: "asd"
        }
      ) {
        ... on RR {
          tog {
            red {
              id
            }
            str
          }
          out {
            str
          }
          out {
            rec {
              articleId
            }
            str
          }
          sim {
            rec {
              articleId
            }
            str
          }
          vs {
            str
          }
        }
      }
    }
  `;

  const normalized_document = normalizeOperation({
    document: parse(raw_document),
    operationName: 'test',
    hideLiterals: true,
    removeAliases: true,
  });

  const collectResult = await collect({
    operations: [
      {
        operation: normalizeOperation({
          document: parse(raw_document),
          operationName: 'test',
          hideLiterals: true,
          removeAliases: true,
        }),
        operationName: 'test',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token,
  });

  expect(collectResult.status).toEqual(200);

  await waitFor(5_000);

  const from = formatISO(subHours(Date.now(), 6));
  const to = formatISO(Date.now());
  const operationStatsResult = await readOperationsStats(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      period: {
        from,
        to,
      },
    },
    token
  );

  expect(operationStatsResult.body.errors).not.toBeDefined();

  const operationsStats = operationStatsResult.body.data!.operationsStats;

  expect(operationsStats.operations.nodes).toHaveLength(1);

  const op = operationsStats.operations.nodes[0];

  expect(op.count).toEqual(1);
  expect(() => {
    parse(op.document);
  }).not.toThrow();
  expect(print(parse(op.document))).toEqual(print(parse(normalized_document)));
  expect(op.operationHash).toBeDefined();
  expect(op.duration.p75).toEqual(200);
  expect(op.duration.p90).toEqual(200);
  expect(op.duration.p95).toEqual(200);
  expect(op.duration.p99).toEqual(200);
  expect(op.kind).toEqual('query');
  expect(op.name).toMatch('test');
  expect(op.percentage).toBeGreaterThan(99);
});

test('number of produced and collected operations should match (no errors)', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;

  const batchSize = 1000;
  const totalAmount = 10_000;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of new Array(totalAmount / batchSize)) {
    await sendBatch(
      batchSize,
      {
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
      token
    );
  }

  await waitFor(5_000);

  const from = formatISO(subHours(Date.now(), 6));
  const to = formatISO(Date.now());
  const operationStatsResult = await readOperationsStats(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      period: {
        from,
        to,
      },
    },
    token
  );

  expect(operationStatsResult.body.errors).not.toBeDefined();

  const operationsStats = operationStatsResult.body.data!.operationsStats;

  // We sent a single operation (multiple times)
  expect(operationsStats.operations.nodes).toHaveLength(1);

  const op = operationsStats.operations.nodes[0];

  expect(op.count).toEqual(totalAmount);
  expect(op.document).toMatch('ping');
  expect(op.operationHash).toBeDefined();
  expect(op.duration.p75).toEqual(200);
  expect(op.duration.p90).toEqual(200);
  expect(op.duration.p95).toEqual(200);
  expect(op.duration.p99).toEqual(200);
  expect(op.kind).toEqual('query');
  expect(op.name).toMatch('ping');
  expect(op.percentage).toBeGreaterThan(99);
});

test('check usage from two selected targets', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const staging = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const productionTargetResult = await createTarget(
    {
      name: 'production',
      organization: org.cleanId,
      project: project.cleanId,
    },
    owner_access_token
  );

  const production = productionTargetResult.body.data!.createTarget.ok!.createdTarget;

  const stagingTokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: staging.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  const productionTokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(stagingTokenResult.body.errors).not.toBeDefined();
  expect(productionTokenResult.body.errors).not.toBeDefined();

  const tokenForStaging = stagingTokenResult.body.data!.createToken.ok!.secret;
  const tokenForProduction = productionTokenResult.body.data!.createToken.ok!.secret;

  const schemaPublishResult = await publishSchema(
    {
      author: 'Kamil',
      commit: 'usage-check-2',
      sdl: `type Query { ping: String me: String }`,
    },
    tokenForStaging
  );

  expect(schemaPublishResult.body.errors).not.toBeDefined();
  expect((schemaPublishResult.body.data!.schemaPublish as any).valid).toEqual(true);

  const targetValidationResult = await setTargetValidation(
    {
      enabled: true,
      organization: org.cleanId,
      project: project.cleanId,
      target: staging.cleanId,
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(targetValidationResult.body.errors).not.toBeDefined();
  expect(targetValidationResult.body.data!.setTargetValidation.enabled).toEqual(true);
  expect(targetValidationResult.body.data!.setTargetValidation.percentage).toEqual(0);
  expect(targetValidationResult.body.data!.setTargetValidation.period).toEqual(30);

  const collectResult = await collect({
    operations: [
      {
        timestamp: Date.now(),
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {},
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token: tokenForProduction, // put collected operation in production
  });

  expect(collectResult.status).toEqual(200);

  await waitFor(5_000);

  // should not be breaking because the field is unused on staging
  const unusedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`, // ping is used but on production
    },
    tokenForStaging
  );
  expect(unusedCheckResult.body.errors).not.toBeDefined();
  expect(unusedCheckResult.body.data!.schemaCheck.__typename).toEqual('SchemaCheckSuccess');

  // Now switch to using checking both staging and production

  const updateValidationResult = await updateTargetValidationSettings(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: staging.cleanId,
      percentage: 50, // Out of 3 requests, 1 is for Query.me, 2 are done for Query.me so it's 1/3 = 33.3%
      period: 2,
      targets: [production.id, staging.id],
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(updateValidationResult.body.errors).not.toBeDefined();
  expect(updateValidationResult.body.data!.updateTargetValidationSettings.error).toBeNull();
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.percentage
  ).toEqual(50);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.period
  ).toEqual(2);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.targets
  ).toHaveLength(2);

  // should be non-breaking because the field is used in production and we are checking staging and production now
  // and it used in less than 50% of traffic
  const usedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`, // ping is used on production and we do check production now
    },
    tokenForStaging
  );

  if (usedCheckResult.body.data!.schemaCheck.__typename !== 'SchemaCheckSuccess') {
    throw new Error(`Expected SchemaCheckSuccess, got ${usedCheckResult.body.data!.schemaCheck.__typename}`);
  }

  expect(usedCheckResult.body.data!.schemaCheck.valid).toEqual(true);
  expect(usedCheckResult.body.errors).not.toBeDefined();
});

test('check usage from two selected targets (legacy registry mode)', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
      useLegacyRegistryModel: true,
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const staging = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const productionTargetResult = await createTarget(
    {
      name: 'production',
      organization: org.cleanId,
      project: project.cleanId,
    },
    owner_access_token
  );

  const production = productionTargetResult.body.data!.createTarget.ok!.createdTarget;

  const stagingTokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: staging.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  const productionTokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(stagingTokenResult.body.errors).not.toBeDefined();
  expect(productionTokenResult.body.errors).not.toBeDefined();

  const tokenForStaging = stagingTokenResult.body.data!.createToken.ok!.secret;
  const tokenForProduction = productionTokenResult.body.data!.createToken.ok!.secret;

  const schemaPublishResult = await publishSchema(
    {
      author: 'Kamil',
      commit: 'usage-check-2',
      sdl: `type Query { ping: String me: String }`,
    },
    tokenForStaging
  );

  expect(schemaPublishResult.body.errors).not.toBeDefined();
  expect((schemaPublishResult.body.data!.schemaPublish as any).valid).toEqual(true);

  const targetValidationResult = await setTargetValidation(
    {
      enabled: true,
      organization: org.cleanId,
      project: project.cleanId,
      target: staging.cleanId,
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(targetValidationResult.body.errors).not.toBeDefined();
  expect(targetValidationResult.body.data!.setTargetValidation.enabled).toEqual(true);
  expect(targetValidationResult.body.data!.setTargetValidation.percentage).toEqual(0);
  expect(targetValidationResult.body.data!.setTargetValidation.period).toEqual(30);

  const collectResult = await collect({
    operations: [
      {
        timestamp: Date.now(),
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {},
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token: tokenForProduction, // put collected operation in production
  });

  expect(collectResult.status).toEqual(200);

  await waitFor(5_000);

  // should not be breaking because the field is unused on staging
  const unusedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`, // ping is used but on production
    },
    tokenForStaging
  );
  expect(unusedCheckResult.body.errors).not.toBeDefined();
  expect(unusedCheckResult.body.data!.schemaCheck.__typename).toEqual('SchemaCheckSuccess');

  // Now switch to using checking both staging and production

  const updateValidationResult = await updateTargetValidationSettings(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: staging.cleanId,
      percentage: 50, // Out of 3 requests, 1 is for Query.me, 2 are done for Query.me so it's 1/3 = 33.3%
      period: 2,
      targets: [production.id, staging.id],
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(updateValidationResult.body.errors).not.toBeDefined();
  expect(updateValidationResult.body.data!.updateTargetValidationSettings.error).toBeNull();
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.percentage
  ).toEqual(50);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.period
  ).toEqual(2);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.targets
  ).toHaveLength(2);

  // should be non-breaking because the field is used in production and we are checking staging and production now
  // and it used in less than 50% of traffic
  const usedCheckResult = await checkSchema(
    {
      sdl: `type Query { me: String }`, // ping is used on production and we do check production now
    },
    tokenForStaging
  );

  if (usedCheckResult.body.data!.schemaCheck.__typename !== 'SchemaCheckSuccess') {
    throw new Error(`Expected SchemaCheckSuccess, got ${usedCheckResult.body.data!.schemaCheck.__typename}`);
  }

  expect(usedCheckResult.body.data!.schemaCheck.valid).toEqual(true);
  expect(usedCheckResult.body.errors).not.toBeDefined();
});

test('check usage not from excluded client names', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const production = projectResult.body.data!.createProject.ok!.createdTargets.find(t => t.name === 'production');

  if (!production) {
    throw new Error('No production target');
  }

  const productionTokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(productionTokenResult.body.errors).not.toBeDefined();

  const tokenForProduction = productionTokenResult.body.data!.createToken.ok!.secret;

  const schemaPublishResult = await publishSchema(
    {
      author: 'Kamil',
      commit: 'usage-check-2',
      sdl: `type Query { ping: String me: String }`,
    },
    tokenForProduction
  );

  expect(schemaPublishResult.body.errors).not.toBeDefined();
  expect((schemaPublishResult.body.data!.schemaPublish as any).valid).toEqual(true);

  const targetValidationResult = await setTargetValidation(
    {
      enabled: true,
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(targetValidationResult.body.errors).not.toBeDefined();
  expect(targetValidationResult.body.data!.setTargetValidation.enabled).toEqual(true);
  expect(targetValidationResult.body.data!.setTargetValidation.percentage).toEqual(0);
  expect(targetValidationResult.body.data!.setTargetValidation.period).toEqual(30);

  const collectResult = await collect({
    operations: [
      {
        timestamp: Date.now(),
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {
          client: {
            name: 'cli',
            version: '2.0.0',
          },
        },
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {
          client: {
            name: 'app',
            version: '1.0.0',
          },
        },
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {
          client: {
            name: 'app',
            version: '1.0.1',
          },
        },
      },
    ],
    token: tokenForProduction,
  });

  expect(collectResult.status).toEqual(200);

  await waitFor(5_000);

  // should be breaking because the field is used
  const unusedCheckResult = await checkSchema(
    {
      sdl: `type Query { ping: String }`, // Query.me is used
    },
    tokenForProduction
  );
  expect(unusedCheckResult.body.errors).not.toBeDefined();
  expect(unusedCheckResult.body.data!.schemaCheck.__typename).toEqual('SchemaCheckError');

  // Exclude app from the check
  const updateValidationResult = await updateTargetValidationSettings(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
      percentage: 0,
      period: 2,
      targets: [production.id],
      excludedClients: ['app'],
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(updateValidationResult.body.errors).not.toBeDefined();
  expect(updateValidationResult.body.data!.updateTargetValidationSettings.error).toBeNull();
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.enabled
  ).toBe(true);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.excludedClients
  ).toHaveLength(1);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.excludedClients
  ).toContainEqual('app');

  // should be safe because the field was not used by the non-excluded clients (cli never requested `Query.me`, but app did)
  const usedCheckResult = await checkSchema(
    {
      sdl: `type Query { ping: String }`,
    },
    tokenForProduction
  );

  if (usedCheckResult.body.data!.schemaCheck.__typename !== 'SchemaCheckSuccess') {
    throw new Error(`Expected SchemaCheckSuccess, got ${usedCheckResult.body.data!.schemaCheck.__typename}`);
  }

  expect(usedCheckResult.body.data!.schemaCheck.valid).toEqual(true);
  expect(usedCheckResult.body.errors).not.toBeDefined();
});

test('check usage not from excluded client names (legacy registry mode)', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const production = projectResult.body.data!.createProject.ok!.createdTargets.find(t => t.name === 'production');

  if (!production) {
    throw new Error('No production target');
  }

  const productionTokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(productionTokenResult.body.errors).not.toBeDefined();

  const tokenForProduction = productionTokenResult.body.data!.createToken.ok!.secret;

  const schemaPublishResult = await publishSchema(
    {
      author: 'Kamil',
      commit: 'usage-check-2',
      sdl: `type Query { ping: String me: String }`,
    },
    tokenForProduction
  );

  expect(schemaPublishResult.body.errors).not.toBeDefined();
  expect((schemaPublishResult.body.data!.schemaPublish as any).valid).toEqual(true);

  const targetValidationResult = await setTargetValidation(
    {
      enabled: true,
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(targetValidationResult.body.errors).not.toBeDefined();
  expect(targetValidationResult.body.data!.setTargetValidation.enabled).toEqual(true);
  expect(targetValidationResult.body.data!.setTargetValidation.percentage).toEqual(0);
  expect(targetValidationResult.body.data!.setTargetValidation.period).toEqual(30);

  const collectResult = await collect({
    operations: [
      {
        timestamp: Date.now(),
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {
          client: {
            name: 'cli',
            version: '2.0.0',
          },
        },
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {
          client: {
            name: 'app',
            version: '1.0.0',
          },
        },
      },
      {
        timestamp: Date.now(),
        operation: 'query me { me }',
        operationName: 'me',
        fields: ['Query', 'Query.me'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {
          client: {
            name: 'app',
            version: '1.0.1',
          },
        },
      },
    ],
    token: tokenForProduction,
  });

  expect(collectResult.status).toEqual(200);

  await waitFor(5_000);

  // should be breaking because the field is used
  const unusedCheckResult = await checkSchema(
    {
      sdl: `type Query { ping: String }`, // Query.me is used
    },
    tokenForProduction
  );
  expect(unusedCheckResult.body.errors).not.toBeDefined();
  expect(unusedCheckResult.body.data!.schemaCheck.__typename).toEqual('SchemaCheckError');

  // Exclude app from the check
  const updateValidationResult = await updateTargetValidationSettings(
    {
      organization: org.cleanId,
      project: project.cleanId,
      target: production.cleanId,
      percentage: 0,
      period: 2,
      targets: [production.id],
      excludedClients: ['app'],
    },
    {
      authToken: owner_access_token,
    }
  );

  expect(updateValidationResult.body.errors).not.toBeDefined();
  expect(updateValidationResult.body.data!.updateTargetValidationSettings.error).toBeNull();
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.enabled
  ).toBe(true);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.excludedClients
  ).toHaveLength(1);
  expect(
    updateValidationResult.body.data!.updateTargetValidationSettings.ok!.updatedTargetValidationSettings.excludedClients
  ).toContainEqual('app');

  // should be safe because the field was not used by the non-excluded clients (cli never requested `Query.me`, but app did)
  const usedCheckResult = await checkSchema(
    {
      sdl: `type Query { ping: String }`,
    },
    tokenForProduction
  );

  if (usedCheckResult.body.data!.schemaCheck.__typename !== 'SchemaCheckSuccess') {
    throw new Error(`Expected SchemaCheckSuccess, got ${usedCheckResult.body.data!.schemaCheck.__typename}`);
  }

  expect(usedCheckResult.body.data!.schemaCheck.valid).toEqual(true);
  expect(usedCheckResult.body.errors).not.toBeDefined();
});

test('number of produced and collected operations should match', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;

  const batchSize = 1000;
  const totalAmount = 10_000;
  for await (const i of new Array(totalAmount / batchSize).fill(null).map((_, i) => i)) {
    await sendBatch(
      batchSize,
      i % 2 === 0
        ? {
            operation: 'query ping { ping }',
            operationName: 'ping',
            fields: ['Query', 'Query.ping'],
            execution: {
              ok: true,
              duration: 200000000,
              errorsTotal: 0,
            },
          }
        : {
            operation: 'query ping { ping }',
            operationName: 'ping',
            fields: ['Query', 'Query.ping'],
            execution: {
              ok: true,
              duration: 200000000,
              errorsTotal: 0,
            },
            metadata: {
              client: {
                name: 'web',
                version: '1.2.3',
              },
            },
          },
      token
    );
  }

  await waitFor(5_000);

  const result = await clickHouseQuery<{
    target: string;
    client_name: string | null;
    hash: string;
    total: number;
  }>(`
    SELECT
      target, client_name, hash, sum(total) as total
    FROM ${FF_CLICKHOUSE_V2_TABLES ? 'clients_daily' : 'client_names_daily'}
    WHERE 
      timestamp >= subtractDays(now(), 30)
      AND timestamp <= now()
    GROUP BY target, client_name, hash
  `);

  expect(result.rows).toEqual(2);
  expect(result.data).toContainEqual(
    expect.objectContaining({
      target: target.id,
      client_name: 'web',
      hash: expect.any(String),
      total: expect.stringMatching('5000'),
    })
  );
  expect(result.data).toContainEqual(
    expect.objectContaining({
      target: target.id,
      client_name: '',
      hash: expect.any(String),
      total: expect.stringMatching('5000'),
    })
  );
});

test('different order of schema coordinates should not result in different hash', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;

  await collect({
    operations: [
      {
        operation: 'query ping {        ping      }', // those spaces are expected and important to ensure normalization is in place
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
      {
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query.ping', 'Query'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token,
  });

  await waitFor(5_000);

  const coordinatesResult = await clickHouseQuery<{
    target: string;
    client_name: string | null;
    hash: string;
    total: number;
  }>(`
    SELECT coordinate, hash FROM ${
      FF_CLICKHOUSE_V2_TABLES ? 'coordinates_daily' : 'schema_coordinates_daily'
    } GROUP BY coordinate, hash
  `);

  expect(coordinatesResult.rows).toEqual(2);

  const operationCollectionResult = await clickHouseQuery<{
    target: string;
    client_name: string | null;
    hash: string;
    total: number;
  }>(
    FF_CLICKHOUSE_V2_TABLES
      ? `SELECT hash FROM operation_collection GROUP BY hash`
      : `SELECT hash FROM operations_registry FINAL GROUP BY hash`
  );

  expect(operationCollectionResult.rows).toEqual(1);
});

test('same operation but with different schema coordinates should result in different hash', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;

  await collect({
    operations: [
      {
        operation: 'query ping {        ping      }', // those spaces are expected and important to ensure normalization is in place
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
      {
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['RootQuery', 'RootQuery.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token,
  });

  await waitFor(5_000);

  const coordinatesResult = await clickHouseQuery<{
    coordinate: string;
    hash: string;
  }>(`
    SELECT coordinate, hash FROM ${
      FF_CLICKHOUSE_V2_TABLES ? 'coordinates_daily' : 'schema_coordinates_daily'
    } GROUP BY coordinate, hash
  `);

  expect(coordinatesResult.rows).toEqual(4);

  const operationCollectionResult = await clickHouseQuery<{
    hash: string;
  }>(
    FF_CLICKHOUSE_V2_TABLES
      ? `SELECT hash FROM operation_collection GROUP BY hash`
      : `SELECT hash FROM operations_registry FINAL GROUP BY hash`
  );

  expect(operationCollectionResult.rows).toEqual(2);

  const operationsResult = await clickHouseQuery<{
    target: string;
    client_name: string | null;
    hash: string;
    total: number;
  }>(
    FF_CLICKHOUSE_V2_TABLES
      ? `SELECT hash FROM operation_collection GROUP BY hash`
      : `SELECT hash FROM operations_registry FINAL GROUP BY hash`
  );

  expect(operationsResult.rows).toEqual(2);
});

test('operations with the same schema coordinates and body but with different name should result in different hashes', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;

  await collect({
    operations: [
      {
        operation: 'query pingv2 { ping }',
        operationName: 'pingv2',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
      {
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
    ],
    token,
  });

  await waitFor(5_000);

  const coordinatesResult = await clickHouseQuery<{
    target: string;
    client_name: string | null;
    hash: string;
    total: number;
  }>(`
    SELECT coordinate, hash FROM ${
      FF_CLICKHOUSE_V2_TABLES ? 'coordinates_daily' : 'schema_coordinates_daily'
    } GROUP BY coordinate, hash
  `);

  expect(coordinatesResult.rows).toEqual(4);

  const operationsResult = await clickHouseQuery<{
    target: string;
    client_name: string | null;
    hash: string;
    total: number;
  }>(
    FF_CLICKHOUSE_V2_TABLES
      ? `SELECT hash FROM operation_collection GROUP BY hash`
      : `SELECT hash FROM operations_registry FINAL GROUP BY hash`
  );

  expect(operationsResult.rows).toEqual(2);
});

test('ensure correct data', async () => {
  const { access_token: owner_access_token } = await authenticate('main');
  const orgResult = await createOrganization(
    {
      name: 'foo',
    },
    owner_access_token
  );

  const org = orgResult.body.data!.createOrganization.ok!.createdOrganizationPayload.organization;

  const projectResult = await createProject(
    {
      organization: org.cleanId,
      type: ProjectType.Single,
      name: 'foo',
    },
    owner_access_token
  );

  const project = projectResult.body.data!.createProject.ok!.createdProject;
  const target = projectResult.body.data!.createProject.ok!.createdTargets[0];

  const tokenResult = await createToken(
    {
      name: 'test',
      organization: org.cleanId,
      project: project.cleanId,
      target: target.cleanId,
      organizationScopes: [OrganizationAccessScope.Read],
      projectScopes: [ProjectAccessScope.Read],
      targetScopes: [TargetAccessScope.Read, TargetAccessScope.RegistryRead, TargetAccessScope.RegistryWrite],
    },
    owner_access_token
  );

  expect(tokenResult.body.errors).not.toBeDefined();

  const token = tokenResult.body.data!.createToken.ok!.secret;

  await collect({
    operations: [
      {
        operation: 'query ping {        ping      }', // those spaces are expected and important to ensure normalization is in place
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
      },
      {
        operation: 'query ping { ping }',
        operationName: 'ping',
        fields: ['Query', 'Query.ping'],
        execution: {
          ok: true,
          duration: 200000000,
          errorsTotal: 0,
        },
        metadata: {
          client: {
            name: 'test-name',
            version: 'test-version',
          },
        },
      },
    ],
    token,
  });

  await waitFor(5_000);

  if (FF_CLICKHOUSE_V2_TABLES) {
    // operation_collection
    const operationCollectionResult = await clickHouseQuery<{
      target: string;
      hash: string;
      name: string;
      body: string;
      operation_kind: string;
      coordinates: string[];
      total: string;
      timestamp: string;
      expires_at: string;
    }>(`
      SELECT
        target,
        hash,
        name,
        body,
        operation_kind,
        sum(total) as total,
        coordinates
      FROM operation_collection
      GROUP BY target, hash, coordinates, name, body, operation_kind
    `);

    expect(operationCollectionResult.data).toHaveLength(1);

    const operationCollectionRow = operationCollectionResult.data[0];
    expect(operationCollectionRow.body).toEqual('query ping{ping}');
    expect(operationCollectionRow.coordinates).toHaveLength(2);
    expect(operationCollectionRow.coordinates).toContainEqual('Query.ping');
    expect(operationCollectionRow.coordinates).toContainEqual('Query');
    expect(operationCollectionRow.hash).toHaveLength(32);
    expect(operationCollectionRow.name).toBe('ping');
    expect(operationCollectionRow.target).toBe(target.id);
    expect(ensureNumber(operationCollectionRow.total)).toEqual(2);

    // operations
    const operationsResult = await clickHouseQuery<{
      target: string;
      timestamp: string;
      expires_at: string;
      hash: string;
      ok: boolean;
      errors: number;
      duration: number;
      client_name: string;
      client_version: string;
    }>(`
      SELECT
        target,
        timestamp,
        expires_at,
        hash,
        ok,
        errors,
        duration,
        client_name,
        client_version
      FROM operations
    `);

    expect(operationsResult.data).toHaveLength(2);

    const operationWithClient = operationsResult.data.find(o => o.client_name.length > 0)!;
    expect(operationWithClient).toBeDefined();
    expect(operationWithClient.client_name).toEqual('test-name');
    expect(operationWithClient.client_version).toEqual('test-version');
    expect(ensureNumber(operationWithClient.duration)).toEqual(200_000_000);
    expect(ensureNumber(operationWithClient.errors)).toEqual(0);
    expect(operationWithClient.hash).toHaveLength(32);
    expect(operationWithClient.target).toEqual(target.id);

    const operationWithoutClient = operationsResult.data.find(o => o.client_name.length === 0)!;
    expect(operationWithoutClient).toBeDefined();
    expect(operationWithoutClient.client_name).toHaveLength(0);
    expect(operationWithoutClient.client_version).toHaveLength(0);
    expect(ensureNumber(operationWithoutClient.duration)).toEqual(200_000_000);
    expect(ensureNumber(operationWithoutClient.errors)).toEqual(0);
    expect(operationWithoutClient.hash).toHaveLength(32);
    expect(operationWithoutClient.target).toEqual(target.id);

    // operations_hourly
    const operationsHourlyResult = await clickHouseQuery<{
      target: string;
      hash: string;
      total_ok: string;
      total: string;
      quantiles: [number];
    }>(`
      SELECT
        target,
        sum(total) as total,
        sum(total_ok) as total_ok,
        hash,
        quantilesMerge(0.99)(duration_quantiles) as quantiles
      FROM operations_hourly GROUP BY target, hash
    `);

    expect(operationsHourlyResult.data).toHaveLength(1);

    const hourlyAgg = operationsHourlyResult.data[0];
    expect(hourlyAgg).toBeDefined();
    expect(ensureNumber(hourlyAgg.quantiles[0])).toEqual(200_000_000);
    expect(ensureNumber(hourlyAgg.total)).toEqual(2);
    expect(ensureNumber(hourlyAgg.total_ok)).toEqual(2);
    expect(hourlyAgg.hash).toHaveLength(32);
    expect(hourlyAgg.target).toEqual(target.id);

    // operations_daily
    const operationsDailyResult = await clickHouseQuery<{
      target: string;
      hash: string;
      total_ok: string;
      total: string;
      quantiles: [number];
    }>(`
      SELECT
        target,
        sum(total) as total,
        sum(total_ok) as total_ok,
        hash,
        quantilesMerge(0.99)(duration_quantiles) as quantiles
      FROM operations_daily GROUP BY target, hash
    `);

    expect(operationsDailyResult.data).toHaveLength(1);

    const dailyAgg = operationsDailyResult.data[0];
    expect(dailyAgg).toBeDefined();
    expect(ensureNumber(dailyAgg.quantiles[0])).toEqual(200_000_000);
    expect(ensureNumber(dailyAgg.total)).toEqual(2);
    expect(ensureNumber(dailyAgg.total_ok)).toEqual(2);
    expect(dailyAgg.hash).toHaveLength(32);
    expect(dailyAgg.target).toEqual(target.id);

    // coordinates_daily
    const coordinatesDailyResult = await clickHouseQuery<{
      target: string;
      hash: string;
      total: string;
      coordinate: string;
    }>(`
      SELECT
        target,
        sum(total) as total,
        hash,
        coordinate
      FROM coordinates_daily GROUP BY target, hash, coordinate
    `);

    expect(coordinatesDailyResult.data).toHaveLength(2);

    const rootCoordinate = coordinatesDailyResult.data.find(c => c.coordinate === 'Query')!;
    expect(rootCoordinate).toBeDefined();
    expect(ensureNumber(rootCoordinate.total)).toEqual(2);
    expect(rootCoordinate.hash).toHaveLength(32);
    expect(rootCoordinate.target).toEqual(target.id);

    const fieldCoordinate = coordinatesDailyResult.data.find(c => c.coordinate === 'Query.ping')!;
    expect(fieldCoordinate).toBeDefined();
    expect(ensureNumber(fieldCoordinate.total)).toEqual(2);
    expect(fieldCoordinate.hash).toHaveLength(32);
    expect(fieldCoordinate.target).toEqual(target.id);

    // clients_daily
    const clientsDailyResult = await clickHouseQuery<{
      target: string;
      hash: string;
      client_name: string;
      client_version: string;
      total: string;
    }>(`
      SELECT
        target,
        sum(total) as total,
        hash,
        client_name,
        client_version
      FROM clients_daily
      GROUP BY target, hash, client_name, client_version
    `);

    expect(clientsDailyResult.data).toHaveLength(2);

    const dailyAggOfKnownClient = clientsDailyResult.data.find(c => c.client_name === 'test-name')!;
    expect(dailyAggOfKnownClient).toBeDefined();
    expect(ensureNumber(dailyAggOfKnownClient.total)).toEqual(1);
    expect(dailyAggOfKnownClient.client_version).toBe('test-version');
    expect(dailyAggOfKnownClient.hash).toHaveLength(32);
    expect(dailyAggOfKnownClient.target).toEqual(target.id);

    const dailyAggOfUnknownClient = clientsDailyResult.data.find(c => c.client_name !== 'test-name')!;
    expect(dailyAggOfUnknownClient).toBeDefined();
    expect(ensureNumber(dailyAggOfUnknownClient.total)).toEqual(1);
    expect(dailyAggOfUnknownClient.client_version).toHaveLength(0);
    expect(dailyAggOfUnknownClient.hash).toHaveLength(32);
    expect(dailyAggOfUnknownClient.target).toEqual(target.id);
  } else {
    // operations_registry
    const operationsRegistryResult = await clickHouseQuery<{
      target: string;
      hash: string;
      name: string;
      body: string;
      operation: string;
    }>(`
          SELECT
            target,
            hash,
            name,
            body,
            operation
          FROM operations_registry FINAL
          GROUP BY target, hash, name, body, operation
        `);

    expect(operationsRegistryResult.data).toHaveLength(1);

    const operationCollectionRow = operationsRegistryResult.data[0];
    expect(operationCollectionRow.body).toEqual('query ping{ping}');
    expect(operationCollectionRow.hash).toHaveLength(32);
    expect(operationCollectionRow.name).toBe('ping');
    expect(operationCollectionRow.target).toBe(target.id);

    // operations_new
    const operationsResult = await clickHouseQuery<{
      target: string;
      hash: string;
      ok: boolean;
      errors: number;
      duration: number;
      schema: string[];
      client_name: string;
      client_version: string;
    }>(`
          SELECT
            target,
            hash,
            ok,
            errors,
            duration,
            schema,
            client_name,
            client_version
          FROM operations_new
        `);

    expect(operationsResult.data).toHaveLength(2);

    const operationWithClient = operationsResult.data.find(o => o.client_name.length > 0)!;
    expect(operationWithClient).toBeDefined();
    expect(operationWithClient.client_name).toEqual('test-name');
    expect(operationWithClient.client_version).toEqual('test-version');
    expect(operationWithClient.schema).toHaveLength(2);
    expect(operationWithClient.schema).toContainEqual('Query.ping');
    expect(operationWithClient.schema).toContainEqual('Query');
    expect(ensureNumber(operationWithClient.duration)).toEqual(200_000_000);
    expect(ensureNumber(operationWithClient.errors)).toEqual(0);
    expect(operationWithClient.hash).toHaveLength(32);
    expect(operationWithClient.target).toEqual(target.id);

    const operationWithoutClient = operationsResult.data.find(o => o.client_name.length === 0)!;
    expect(operationWithoutClient).toBeDefined();
    expect(operationWithoutClient.client_name).toHaveLength(0);
    expect(operationWithoutClient.client_version).toHaveLength(0);
    expect(operationWithClient.schema).toHaveLength(2);
    expect(operationWithClient.schema).toContainEqual('Query.ping');
    expect(operationWithClient.schema).toContainEqual('Query');
    expect(ensureNumber(operationWithoutClient.duration)).toEqual(200_000_000);
    expect(ensureNumber(operationWithoutClient.errors)).toEqual(0);
    expect(operationWithoutClient.hash).toHaveLength(32);
    expect(operationWithoutClient.target).toEqual(target.id);

    // operations_new_hourly_mv
    const operationsHourlyResult = await clickHouseQuery<{
      target: string;
      hash: string;
      total_ok: string;
      total: string;
      quantiles: [number];
    }>(`
          SELECT
            target,
            hash,
            sum(total) as total,
            sum(total_ok) as total_ok,
            quantilesMerge(0.99)(duration_quantiles) as quantiles
          FROM operations_new_hourly_mv GROUP BY target, hash
        `);

    expect(operationsHourlyResult.data).toHaveLength(1);

    const hourlyAgg = operationsHourlyResult.data[0];
    expect(hourlyAgg).toBeDefined();
    expect(ensureNumber(hourlyAgg.quantiles[0])).toEqual(200_000_000);
    expect(ensureNumber(hourlyAgg.total)).toEqual(2);
    expect(ensureNumber(hourlyAgg.total_ok)).toEqual(2);
    expect(hourlyAgg.hash).toHaveLength(32);
    expect(hourlyAgg.target).toEqual(target.id);

    // schema_coordinates_daily
    const coordinatesDailyResult = await clickHouseQuery<{
      target: string;
      hash: string;
      total: string;
      coordinate: string;
    }>(`
          SELECT
            target,
            sum(total) as total,
            hash,
            coordinate
          FROM schema_coordinates_daily GROUP BY target, hash, coordinate
        `);

    expect(coordinatesDailyResult.data).toHaveLength(2);

    const rootCoordinate = coordinatesDailyResult.data.find(c => c.coordinate === 'Query')!;
    expect(rootCoordinate).toBeDefined();
    expect(ensureNumber(rootCoordinate.total)).toEqual(2);
    expect(rootCoordinate.hash).toHaveLength(32);
    expect(rootCoordinate.target).toEqual(target.id);

    const fieldCoordinate = coordinatesDailyResult.data.find(c => c.coordinate === 'Query.ping')!;
    expect(fieldCoordinate).toBeDefined();
    expect(ensureNumber(fieldCoordinate.total)).toEqual(2);
    expect(fieldCoordinate.hash).toHaveLength(32);
    expect(fieldCoordinate.target).toEqual(target.id);

    // clients_daily
    const clientsDailyResult = await clickHouseQuery<{
      target: string;
      hash: string;
      client_name: string;
      total: string;
    }>(`
          SELECT
            target,
            sum(total) as total,
            hash,
            client_name
          FROM client_names_daily
          GROUP BY target, hash, client_name
        `);

    expect(clientsDailyResult.data).toHaveLength(2);

    const dailyAggOfKnownClient = clientsDailyResult.data.find(c => c.client_name === 'test-name')!;
    expect(dailyAggOfKnownClient).toBeDefined();
    expect(ensureNumber(dailyAggOfKnownClient.total)).toEqual(1);
    expect(dailyAggOfKnownClient.hash).toHaveLength(32);
    expect(dailyAggOfKnownClient.target).toEqual(target.id);

    const dailyAggOfUnknownClient = clientsDailyResult.data.find(c => c.client_name !== 'test-name')!;
    expect(dailyAggOfUnknownClient).toBeDefined();
    expect(ensureNumber(dailyAggOfUnknownClient.total)).toEqual(1);
    expect(dailyAggOfUnknownClient.hash).toHaveLength(32);
    expect(dailyAggOfUnknownClient.target).toEqual(target.id);
  }
});
