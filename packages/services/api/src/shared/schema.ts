import lodash from 'lodash';
import { createHash } from 'crypto';
import {
  buildASTSchema,
  GraphQLSchema,
  lexicographicSortSchema,
  visit,
  DocumentNode,
  Kind,
  DefinitionNode,
  ConstDirectiveNode,
  OperationTypeDefinitionNode,
  FieldDefinitionNode,
  NamedTypeNode,
  EnumValueDefinitionNode,
  InputValueDefinitionNode,
} from 'graphql';
import { SchemaObject } from './entities';

export function hashSchema(schema: SchemaObject): string {
  return createHash('md5')
    .update(schema.raw, 'utf-8')
    .update(`service_name: ${schema.source}`)
    .update(`service_url: ${schema.url || ''}`)
    .digest('hex');
}

/**
 * Builds GraphQLSchema without validation of SDL
 */
export function buildSchema(schema: SchemaObject): GraphQLSchema {
  return lexicographicSortSchema(
    buildASTSchema(schema.document, {
      assumeValid: true,
      assumeValidSDL: true,
    })
  );
}

export function minifySchema(schema: string): string {
  return schema.replace(/\s+/g, ' ').trim();
}

export function createConnection<T>() {
  return {
    nodes(nodes: readonly T[]) {
      return nodes ?? [];
    },
    total(nodes: readonly T[]) {
      return nodes?.length ?? 0;
    },
  };
}

export function sortDocumentNode(doc: DocumentNode): DocumentNode {
  return visit(doc, {
    Document(node) {
      return {
        ...node,
        definitions: sortNodes(node.definitions),
      };
    },
    SchemaDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        operationTypes: sortNodes(node.operationTypes),
      };
    },
    SchemaExtension(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        operationTypes: sortNodes(node.operationTypes),
      };
    },
    ScalarTypeDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
      };
    },
    ScalarTypeExtension(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
      };
    },
    ObjectTypeDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        fields: sortNodes(node.fields),
        interfaces: sortNodes(node.interfaces),
      };
    },
    ObjectTypeExtension(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        fields: sortNodes(node.fields),
        interfaces: sortNodes(node.interfaces),
      };
    },
    InterfaceTypeDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        fields: sortNodes(node.fields),
        interfaces: sortNodes(node.interfaces),
      };
    },
    InterfaceTypeExtension(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        fields: sortNodes(node.fields),
        interfaces: sortNodes(node.interfaces),
      };
    },
    UnionTypeDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        types: sortNodes(node.types),
      };
    },
    UnionTypeExtension(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        types: sortNodes(node.types),
      };
    },
    EnumTypeDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        values: sortNodes(node.values),
      };
    },
    EnumTypeExtension(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        values: sortNodes(node.values),
      };
    },
    InputObjectTypeDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        fields: sortNodes(node.fields),
      };
    },
    InputObjectTypeExtension(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
        fields: sortNodes(node.fields),
      };
    },
    DirectiveDefinition(node) {
      return {
        ...node,
        arguments: sortNodes(node.arguments),
      };
    },
    FieldDefinition(node) {
      return {
        ...node,
        arguments: sortNodes(node.arguments),
        directives: sortNodes(node.directives),
      };
    },
    InputValueDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
      };
    },
    EnumValueDefinition(node) {
      return {
        ...node,
        directives: sortNodes(node.directives),
      };
    },
  });
}

function sortNodes(nodes: readonly DefinitionNode[]): readonly DefinitionNode[];
function sortNodes(nodes: readonly ConstDirectiveNode[] | undefined): readonly ConstDirectiveNode[] | undefined;
function sortNodes(
  nodes: readonly OperationTypeDefinitionNode[] | undefined
): readonly OperationTypeDefinitionNode[] | undefined;
function sortNodes(nodes: readonly FieldDefinitionNode[] | undefined): readonly FieldDefinitionNode[] | undefined;
function sortNodes(nodes: readonly NamedTypeNode[] | undefined): readonly NamedTypeNode[] | undefined;
function sortNodes(
  nodes: readonly EnumValueDefinitionNode[] | undefined
): readonly EnumValueDefinitionNode[] | undefined;
function sortNodes(
  nodes: readonly InputValueDefinitionNode[] | undefined
): readonly InputValueDefinitionNode[] | undefined;
function sortNodes(nodes: readonly any[] | undefined): readonly any[] | undefined {
  if (nodes) {
    if (nodes.length === 0) {
      return [];
    }

    if (isOfKindList<OperationTypeDefinitionNode>(nodes, Kind.OPERATION_TYPE_DEFINITION)) {
      return lodash.sortBy(nodes, 'operation');
    }

    return lodash.sortBy(nodes, 'kind', 'name.value');
  }

  return;
}

function isOfKindList<T>(nodes: readonly any[], kind: string | string[]): nodes is T[] {
  return typeof kind === 'string' ? nodes[0].kind === kind : kind.includes(nodes[0].kind);
}
