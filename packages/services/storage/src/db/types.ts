/* tslint:disable */

/**
 * AUTO-GENERATED FILE - DO NOT EDIT!
 *
 * This file was automatically generated by schemats v.7.0.0
 *
 */

export type alert_channel_type = "SLACK" | "WEBHOOK";
export type alert_type = "SCHEMA_CHANGE_NOTIFICATIONS";
export type operation_kind = "mutation" | "query" | "subscription";
export type organization_type = "PERSONAL" | "REGULAR";
export type user_role = "ADMIN" | "MEMBER";

export interface activities {
  activity_metadata: any;
  activity_type: string;
  created_at: Date;
  id: string;
  organization_id: string;
  project_id: string | null;
  target_id: string | null;
  user_id: string;
}

export interface alert_channels {
  created_at: Date;
  id: string;
  name: string;
  project_id: string;
  slack_channel: string | null;
  type: alert_channel_type;
  webhook_endpoint: string | null;
}

export interface alerts {
  alert_channel_id: string;
  created_at: Date;
  id: string;
  project_id: string;
  target_id: string;
  type: alert_type;
}

export interface commits {
  author: string;
  commit: string;
  content: string;
  created_at: Date;
  id: string;
  metadata: string | null;
  project_id: string;
  service: string | null;
  target_id: string;
}

export interface migration {
  date: Date;
  hash: string;
  name: string;
}

export interface oidc_integrations {
  client_id: string;
  client_secret: string;
  created_at: Date;
  domain: string;
  id: string;
  linked_organization_id: string;
  updated_at: Date;
}

export interface organization_invitations {
  code: string;
  created_at: Date;
  email: string;
  expires_at: Date;
  organization_id: string;
}

export interface organization_member {
  organization_id: string;
  role: user_role;
  scopes: Array<string> | null;
  user_id: string;
}

export interface organizations {
  clean_id: string;
  created_at: Date;
  get_started_checking_schema: boolean;
  get_started_creating_project: boolean;
  get_started_inviting_members: boolean;
  get_started_publishing_schema: boolean;
  get_started_reporting_operations: boolean;
  get_started_usage_breaking: boolean;
  github_app_installation_id: string | null;
  id: string;
  limit_operations_monthly: string;
  limit_retention_days: string;
  name: string;
  plan_name: string;
  slack_token: string | null;
  type: organization_type;
  user_id: string;
}

export interface organizations_billing {
  billing_email_address: string | null;
  external_billing_reference_id: string;
  organization_id: string;
}

export interface persisted_operations {
  content: string;
  created_at: Date;
  id: string;
  operation_hash: string;
  operation_kind: operation_kind;
  operation_name: string;
  project_id: string;
}

export interface projects {
  build_url: string | null;
  clean_id: string;
  created_at: Date;
  external_composition_enabled: boolean;
  external_composition_endpoint: string | null;
  external_composition_secret: string | null;
  git_repository: string | null;
  id: string;
  name: string;
  org_id: string;
  type: string;
  validation_url: string | null;
}

export interface target_validation {
  destination_target_id: string;
  target_id: string;
}

export interface targets {
  base_schema: string | null;
  clean_id: string;
  created_at: Date;
  id: string;
  name: string;
  project_id: string;
  validation_enabled: boolean;
  validation_excluded_clients: Array<string> | null;
  validation_percentage: number;
  validation_period: number;
}

export interface tokens {
  created_at: Date;
  deleted_at: Date | null;
  id: string;
  last_used_at: Date | null;
  name: string;
  organization_id: string;
  project_id: string;
  scopes: Array<string> | null;
  target_id: string;
  token: string;
  token_alias: string;
}

export interface users {
  created_at: Date;
  display_name: string;
  email: string;
  external_auth_user_id: string | null;
  full_name: string;
  id: string;
  is_admin: boolean | null;
  supertoken_user_id: string | null;
  oidc_integration_id: string | null;
}

export interface version_commit {
  commit_id: string;
  url: string | null;
  version_id: string;
}

export interface versions {
  base_schema: string | null;
  commit_id: string;
  created_at: Date;
  id: string;
  target_id: string;
  valid: boolean;
}
