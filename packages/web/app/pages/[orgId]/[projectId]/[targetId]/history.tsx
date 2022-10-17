import { ReactElement, useCallback, useState } from 'react';
import NextLink from 'next/link';
import clsx from 'clsx';
import { VscBug, VscDiff, VscListFlat } from 'react-icons/vsc';
import reactStringReplace from 'react-string-replace';
import { useQuery } from 'urql';

import { authenticated, withSessionProtection } from '@/components/authenticated-container';
import { Label } from '@/components/common';
import { TargetLayout } from '@/components/layouts';
import {
  Badge,
  Button,
  DiffEditor,
  Heading,
  noSchema,
  TimeAgo,
  Title,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/v2';
import {
  CompareDocument,
  CriticalityLevel,
  LatestSchemaDocument,
  SchemaChangeFieldsFragment,
  VersionsDocument,
} from '@/graphql';
import { useRouteSelector } from '@/lib/hooks/use-route-selector';

function labelize(message: string) {
  const findSingleQuotes = /'([^']+)'/gim;

  return reactStringReplace(message, findSingleQuotes, (match, i) => <Label key={i}>{match}</Label>);
}

const titleMap: Record<CriticalityLevel, string> = {
  Safe: 'Safe Changes',
  Breaking: 'Breaking Changes',
  Dangerous: 'Dangerous Changes',
};

const criticalityLevelMapping = {
  [CriticalityLevel.Safe]: 'text-emerald-400',
  [CriticalityLevel.Dangerous]: 'text-yellow-400',
} as Record<CriticalityLevel, string | undefined>;

const ChangesBlock = ({
  changes,
  criticality,
}: {
  changes: SchemaChangeFieldsFragment[];
  criticality: CriticalityLevel;
}): ReactElement | null => {
  const filteredChanges = changes.filter(c => c.criticality === criticality);

  if (!filteredChanges.length) {
    return null;
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">{titleMap[criticality]}</h2>
      <ul className="list-inside list-disc pl-3 text-base leading-relaxed">
        {filteredChanges.map((change, key) => (
          <li key={key} className={clsx(criticalityLevelMapping[criticality] ?? 'text-red-400')}>
            <span className="text-gray-600 dark:text-white">{labelize(change.message)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const DiffView = ({ view, versionId }: { view: 'sdl' | 'list'; versionId: string }): ReactElement | null => {
  const router = useRouteSelector();
  const [compareQuery] = useQuery({
    query: CompareDocument,
    variables: {
      organization: router.organizationId,
      project: router.projectId,
      target: router.targetId,
      version: versionId,
    },
  });
  const comparison = compareQuery.data?.schemaCompareToPrevious;

  if (!comparison) {
    return null;
  }

  if (comparison.__typename === 'SchemaCompareError') {
    return (
      <div className="m-3 rounded-lg bg-red-500/20 p-8">
        <div className="mb-3 flex items-center gap-3">
          <VscBug className="h-8 w-8 text-red-500" />
          <h2 className="text-lg font-medium text-white">Failed to build GraphQL Schema</h2>
        </div>
        <p className="text-base text-gray-500">Schema is most likely incomplete and was force published</p>
      </div>
    );
  }

  const { before, after } = comparison.diff;

  if (view === 'sdl') {
    return <DiffEditor before={before} after={after} />;
  }

  return (
    <div className="space-y-3 p-6">
      <ChangesBlock changes={comparison.changes.nodes} criticality={CriticalityLevel.Breaking} />
      <ChangesBlock changes={comparison.changes.nodes} criticality={CriticalityLevel.Dangerous} />
      <ChangesBlock changes={comparison.changes.nodes} criticality={CriticalityLevel.Safe} />
    </div>
  );
};

// URQL's Infinite scrolling pattern
// https://formidable.com/open-source/urql/docs/basics/ui-patterns/#infinite-scrolling
const ListPage = ({
  variables,
  isLastPage,
  onLoadMore,
  versionId,
}: {
  variables: { after: string; limit: number };
  isLastPage: boolean;
  onLoadMore: (after: string) => void;
  versionId: string;
}): ReactElement => {
  const router = useRouteSelector();

  const [versionsQuery] = useQuery({
    query: VersionsDocument,
    variables: {
      selector: {
        organization: router.organizationId,
        project: router.projectId,
        target: router.targetId,
      },
      ...variables,
    },
    requestPolicy: 'cache-and-network',
  });

  const versions = versionsQuery.data?.schemaVersions;
  const hasMore = versions?.pageInfo.hasMore;

  return (
    <>
      {versions?.nodes.map(version => {
        const commit = version.commit;
        return (
          <NextLink
            key={version.id}
            href={`/${router.organizationId}/${router.projectId}/${router.targetId}/history/${version.id}`}
            passHref
            scroll={false} // disable the scroll to top on page
          >
            <a
              className={clsx(
                'flex flex-col rounded-md p-2.5 hover:bg-gray-800/40',
                versionId === version.id && 'bg-gray-800/40'
              )}
            >
              <h3 className="truncate font-bold">{'commit' in commit ? commit.commit : 'unknown'}</h3>
              <div className="truncate text-xs font-medium text-gray-500">
                <span className="overflow-hidden truncate">{'author' in commit ? commit.author : 'unknown'}</span>
              </div>
              <div className="mt-2.5 mb-1.5 flex align-middle text-xs font-medium text-[#c4c4c4]">
                <div className={clsx('w-1/2 ', !version.isComposable && 'text-red-500')}>
                  <Badge color={version.isComposable ? 'green' : 'red'} /> Published <TimeAgo date={version.date} />
                </div>

                {'serviceName' in commit && commit.serviceName && (
                  <div className="ml-auto mr-0 w-1/2 overflow-hidden text-ellipsis whitespace-nowrap text-right font-bold">
                    {commit.serviceName}
                  </div>
                )}
              </div>
            </a>
          </NextLink>
        );
      })}
      {isLastPage && hasMore && (
        <Button
          variant="link"
          onClick={() => {
            const id = versions.nodes.at(-1)?.id;
            if (typeof id == 'string') {
              onLoadMore(id);
            }
          }}
        >
          Load more
        </Button>
      )}
    </>
  );
};

type View = 'sdl' | 'list';

const Page = ({ versionId }: { versionId: string }) => {
  const [pageVariables, setPageVariables] = useState([{ limit: 10, after: '' }]);

  const [view, setView] = useState<View>('list');
  const onViewChange = useCallback((view: View) => {
    setView(view);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-5">
        <Heading>Versions</Heading>
        <div className="flex h-0 min-w-[420px] grow flex-col gap-2.5 overflow-y-auto rounded-md border border-gray-800/50 p-2.5">
          {pageVariables.map((variables, i) => (
            <ListPage
              key={variables.after}
              variables={variables}
              isLastPage={i === pageVariables.length - 1}
              onLoadMore={after => {
                setPageVariables([...pageVariables, { after, limit: 10 }]);
              }}
              versionId={versionId}
            />
          ))}
        </div>
      </div>
      <div className="flex grow flex-col gap-4">
        <div className="flex items-center justify-between">
          <Heading>Schema</Heading>
          <ToggleGroup
            defaultValue="list"
            onValueChange={onViewChange}
            type="single"
            className="bg-gray-900/50 text-gray-500"
          >
            {[
              { value: 'sdl', icon: <VscDiff /> },
              { value: 'list', icon: <VscListFlat /> },
            ].map(({ value, icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className={clsx('hover:text-white', view === value && 'bg-gray-800 text-white')}
              >
                {icon}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="grow rounded-md border border-gray-800/50">
          <DiffView versionId={versionId} view={view} />
        </div>
      </div>
    </>
  );
};

function HistoryPage(): ReactElement {
  const router = useRouteSelector();
  const [latestSchemaQuery] = useQuery({
    query: LatestSchemaDocument,
    variables: {
      selector: {
        organization: router.organizationId,
        project: router.projectId,
        target: router.targetId,
      },
    },
    requestPolicy: 'cache-and-network',
  });
  const versionId = router.versionId ?? latestSchemaQuery.data?.target?.latestSchemaVersion?.id;

  return (
    <>
      <Title title="History" />
      <TargetLayout value="history" className={versionId ? 'flex h-full items-stretch gap-x-5' : ''}>
        {() => (versionId ? <Page versionId={versionId} /> : noSchema)}
      </TargetLayout>
    </>
  );
}

export const getServerSideProps = withSessionProtection();

export default authenticated(HistoryPage);
