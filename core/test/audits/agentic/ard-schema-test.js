/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import ArdSchema from '../../../audits/agentic/ard-schema.js';

describe('ARD Schema Audit', () => {
  it('is not applicable when no catalog URL is found', () => {
    const artifacts = {
      AgentResourceDiscovery: {
        status: 404,
        content: null,
        discoverySignals: {
          robotsTxtAgentmap: null,
          htmlLink: null,
          httpHeaderLink: null,
          wellKnown: 'https://example.com/.well-known/ai-catalog.json',
        },
      },
    };

    const result = ArdSchema.audit(artifacts);
    expect(result.score).toEqual(1);
    expect(result.notApplicable).toEqual(true);
  });

  it('passes when schema conforms completely', () => {
    const validManifest = {
      specVersion: '1.0',
      entries: [
        {
          identifier: 'urn:air:google:lighthouse:audit-tool',
          displayName: 'Lighthouse Audit Tool',
          type: 'application/mcp-server-card+json',
          url: 'https://example.com/mcp.json',
          representativeQueries: ['audit web page', 'check accessibility'],
          trustManifest: {identity: 'google.com'},
        },
      ],
    };

    const artifacts = {
      AgentResourceDiscovery: {
        status: 200,
        content: JSON.stringify(validManifest),
        discoverySignals: {
          robotsTxtAgentmap: null,
          htmlLink: 'https://example.com/ai-catalog.json',
          httpHeaderLink: null,
          wellKnown: 'https://example.com/.well-known/ai-catalog.json',
        },
      },
    };

    const result = ArdSchema.audit(artifacts);
    expect(result.score).toEqual(1);
    expect(result.details).toBeUndefined();
  });

  it('returns warning (score 0.5) when representativeQueries is missing', () => {
    const manifestWithoutQueries = {
      specVersion: '1.0',
      entries: [
        {
          identifier: 'urn:air:google:lighthouse:audit-tool',
          displayName: 'Lighthouse Audit Tool',
          type: 'application/mcp-server-card+json',
          url: 'https://example.com/mcp.json',
        },
      ],
    };

    const artifacts = {
      AgentResourceDiscovery: {
        status: 200,
        content: JSON.stringify(manifestWithoutQueries),
        discoverySignals: {
          robotsTxtAgentmap: 'https://example.com/ai-catalog.json',
          htmlLink: null,
          httpHeaderLink: null,
          wellKnown: 'https://example.com/.well-known/ai-catalog.json',
        },
      },
    };

    const result = ArdSchema.audit(artifacts);
    expect(result.score).toEqual(0.5);
    expect(result.details.items[0].severity).toEqual('Warning');
    expect(result.details.items[0].issue).toContain('Missing \'representativeQueries\'');
  });

  it('fails with score 0 when insecure http:// URL is found', () => {
    const invalidManifest = {
      specVersion: '1.0',
      entries: [
        {
          identifier: 'urn:air:google:lighthouse:audit-tool',
          displayName: 'Lighthouse Audit Tool',
          type: 'application/mcp-server-card+json',
          url: 'http://example.com/mcp.json', // insecure
        },
      ],
    };

    const artifacts = {
      AgentResourceDiscovery: {
        status: 200,
        content: JSON.stringify(invalidManifest),
        discoverySignals: {
          robotsTxtAgentmap: 'https://example.com/ai-catalog.json',
          htmlLink: null,
          httpHeaderLink: null,
          wellKnown: 'https://example.com/.well-known/ai-catalog.json',
        },
      },
    };

    const result = ArdSchema.audit(artifacts);
    expect(result.score).toEqual(0);
    expect(result.details.items.some(i => i.severity === 'Error')).toEqual(true);
  });
});
