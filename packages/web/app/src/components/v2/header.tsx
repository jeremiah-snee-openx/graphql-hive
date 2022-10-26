import { ReactElement, useCallback, useEffect, useState } from 'react';
import NextLink from 'next/link';
import clsx from 'clsx';
import { useQuery } from 'urql';

import { GetStartedProgress } from '@/components/get-started/wizard';
import { Avatar, Button, DropdownMenu, HiveLink } from '@/components/v2';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  CalendarIcon,
  FileTextIcon,
  GraphQLIcon,
  GridIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
  TrendingUpIcon,
} from '@/components/v2/icon';
import { CreateOrganizationModal } from '@/components/v2/modals';
import { env } from '@/env/frontend';
import { MeDocument, OrganizationsDocument, OrganizationsQuery, OrganizationType } from '@/graphql';
import { getDocsUrl } from '@/lib/docs-url';
import { useRouteSelector } from '@/lib/hooks/use-route-selector';

type DropdownOrganization = OrganizationsQuery['organizations']['nodes'];

export const Header = (): ReactElement => {
  const router = useRouteSelector();
  const [meQuery] = useQuery({ query: MeDocument });
  const [organizationsQuery] = useQuery({ query: OrganizationsDocument });
  const [isModalOpen, setModalOpen] = useState(false);
  const [isOpaque, setIsOpaque] = useState(false);
  const toggleModalOpen = useCallback(() => {
    setModalOpen(prevOpen => !prevOpen);
  }, []);

  const me = meQuery.data?.me;
  const allOrgs = organizationsQuery.data?.organizations.nodes || [];
  const { personal, organizations } = allOrgs.reduce<{
    personal: DropdownOrganization;
    organizations: DropdownOrganization;
  }>(
    (acc, node) => {
      if (node.type === OrganizationType.Personal) {
        acc.personal.push(node);
      } else {
        acc.organizations.push(node);
      }
      return acc;
    },
    { personal: [], organizations: [] }
  );

  const currentOrg =
    typeof router.organizationId === 'string' ? allOrgs.find(org => org.cleanId === router.organizationId) : null;

  // Copied from tailwindcss website
  // https://github.com/tailwindlabs/tailwindcss.com/blob/94971856747c159b4896621c3308bcfa629bb736/src/components/Header.js#L149
  useEffect(() => {
    const offset = 30;

    const onScroll = () => {
      if (!isOpaque && window.scrollY > offset) {
        setIsOpaque(true);
      } else if (isOpaque && window.scrollY <= offset) {
        setIsOpaque(false);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [isOpaque]);

  const docsUrl = getDocsUrl();
  return (
    <header
      className={clsx(
        'fixed top-0 z-40 w-full border-b border-b-transparent transition',
        isOpaque && 'border-b-gray-900 bg-black/80 backdrop-blur'
      )}
    >
      <div className="container flex h-[84px] items-center justify-between">
        <HiveLink />
        <div className="flex flex-row gap-8">
          {currentOrg ? <GetStartedProgress organizationType={currentOrg.type} tasks={currentOrg.getStarted} /> : null}
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button>
                <ArrowDownIcon className="h-5 w-5 text-gray-500" />
                <Avatar shape="circle" className="ml-2.5 border-2 border-gray-900" />
              </Button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content sideOffset={5} align="end">
              <DropdownMenu.Label className="line-clamp-1 mb-2 max-w-[250px] px-2">
                {me?.displayName}
              </DropdownMenu.Label>
              <DropdownMenu>
                {me?.isLinkedToOIDCIntegration ? null : (
                  <DropdownMenu.TriggerItem>
                    <GridIcon className="h-5 w-5" />
                    Switch organization
                    <ArrowDownIcon className="ml-10 -rotate-90 text-white" />
                  </DropdownMenu.TriggerItem>
                )}
                <DropdownMenu.Content sideOffset={25} className="max-w-[300px]">
                  <DropdownMenu.Label className="px-2 text-xs font-bold text-gray-500">PERSONAL</DropdownMenu.Label>
                  {personal.map(org => (
                    <NextLink href={`/${org.cleanId}`} key={org.cleanId}>
                      <a>
                        <DropdownMenu.Item>{org.name}</DropdownMenu.Item>
                      </a>
                    </NextLink>
                  ))}
                  <DropdownMenu.Label className="px-2 text-xs font-bold text-gray-500">
                    OUTERS ORGANIZATIONS
                  </DropdownMenu.Label>
                  {organizations.map(org => (
                    <NextLink href={`/${org.cleanId}`} key={org.cleanId}>
                      <a>
                        <DropdownMenu.Item>{org.name}</DropdownMenu.Item>
                      </a>
                    </NextLink>
                  ))}
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item onSelect={toggleModalOpen}>
                    <PlusIcon className="h-5 w-5" />
                    Create an organization
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
              <DropdownMenu.Item asChild>
                <a href="https://calendly.com/d/zjjt-g8zd/hive-feedback" target="_blank" rel="noreferrer">
                  <CalendarIcon className="h-5 w-5" />
                  Schedule a meeting
                </a>
              </DropdownMenu.Item>

              <NextLink href="/settings">
                <a>
                  <DropdownMenu.Item>
                    <SettingsIcon className="h-5 w-5" />
                    Profile settings
                  </DropdownMenu.Item>
                </a>
              </NextLink>
              {docsUrl ? (
                <DropdownMenu.Item asChild>
                  <a href={docsUrl} target="_blank" rel="noreferrer">
                    <FileTextIcon className="h-5 w-5" />
                    Documentation
                  </a>
                </DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Item asChild>
                <a href="https://status.graphql-hive.com" target="_blank" rel="noreferrer">
                  <AlertTriangleIcon className="h-5 w-5" />
                  Status page
                </a>
              </DropdownMenu.Item>
              {meQuery.data?.me?.isAdmin && (
                <NextLink href="/manage">
                  <a>
                    <DropdownMenu.Item>
                      <TrendingUpIcon className="h-5 w-5" />
                      Manage Instance
                    </DropdownMenu.Item>
                  </a>
                </NextLink>
              )}
              {env.nodeEnv === 'development' && (
                <NextLink href="/dev">
                  <a>
                    <DropdownMenu.Item>
                      <GraphQLIcon className="h-5 w-5" />
                      Dev GraphiQL
                    </DropdownMenu.Item>
                  </a>
                </NextLink>
              )}
              <DropdownMenu.Item asChild>
                <a href="/logout">
                  <LogOutIcon className="h-5 w-5" />
                  Log out
                </a>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
      </div>

      <CreateOrganizationModal isOpen={isModalOpen} toggleModalOpen={toggleModalOpen} />
    </header>
  );
};
