/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Audit} from '../audit.js';
import * as i18n from '../../lib/i18n/i18n.js';

const URN_REGEX = /^urn:air:([a-zA-Z0-9.-]+)(?::([a-zA-Z0-9._:-]+))?:([a-zA-Z0-9._-]+)$/;
const VALID_MEDIA_TYPES = new Set([
  'application/ai-catalog+json',
  'application/agent-card+json',
  'application/a2a-agent-card+json',
  'application/mcp-server-card+json',
  'application/agent-skills+zip',
  'application/agent-skills+gzip',
  'text/markdown; profile="urn:air:agent-skills"',
  'application/ai-registry',
  'application/ai-registry+json',
]);

const UIStrings = {
  /** Title of a Lighthouse audit that evaluates whether ai-catalog.json conforms to the ARD specification. Shown when valid. */
  title: 'ai-catalog.json schema is valid',
  /** Title of a Lighthouse audit that evaluates whether ai-catalog.json conforms to the ARD specification. Shown when invalid. */
  failureTitle: 'ai-catalog.json schema is invalid or has warnings',
  /** Description of a Lighthouse audit that tells the user why ai-catalog.json must match the ARD specification. */
  description: 'Valid ai-catalog.json manifests are required for autonomous ' +
    'AI agents and registries to discover and verify your resources. ' +
    '[Learn more about the ARD specification](https://agenticresourcediscovery.org/spec/).',
};

const str_ = i18n.createIcuMessageFn(import.meta.url, UIStrings);

class ArdSchema extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'ard-schema',
      title: str_(UIStrings.title),
      failureTitle: str_(UIStrings.failureTitle),
      description: str_(UIStrings.description),
      requiredArtifacts: ['AgentResourceDiscovery'],
      supportedModes: ['navigation', 'snapshot'],
    };
  }

  /**
   * @param {any} data
   * @param {function(string, string): void} addError
   * @param {function(string, string): void} addWarning
   */
  static _checkRootProperties(data, addError, addWarning) {
    const specVer = data.specVersion;
    if (!specVer) {
      addError('Root', 'Missing required \'specVersion\' root property.');
    } else if (specVer !== '1.0') {
      addWarning('Root', `Unrecognized 'specVersion': ${specVer}. Expected '1.0'.`);
    }

    if ('collections' in data) {
      addError(
        'Root',
        'Deprecated field check: Found \'collections\' array at root. ' +
          'Top-level collections were REMOVED in ADR-0003. ' +
          'Catalog hierarchies MUST be modeled inside \'entries\' using ' +
          '\'type: application/ai-catalog+json\'.'
      );
    }
  }

  /**
   * @param {any} entry
   * @param {number} idx
   * @param {function(string, string): void} addError
   * @param {function(string, string): void} addWarning
   */
  static _checkEntry(entry, idx, addError, addWarning) {
    const label = (entry && (entry.displayName || entry.identifier)) || `Entry #${idx}`;

    if (typeof entry !== 'object' || entry === null) {
      addError(label, 'Entry MUST be a JSON object.');
      return;
    }

    const ident = entry.identifier;
    if (!ident) {
      addError(label, 'Missing required \'identifier\'.');
    } else if (typeof ident !== 'string' || !URN_REGEX.test(ident)) {
      addError(
        label,
        `Identifier '${ident}' does not match RFC 8141 URN pattern ` +
          '\'urn:air:<publisher>:<namespace>:<agent-name>\'.'
      );
    }

    const dispName = entry.displayName;
    if (!dispName) {
      addError(label, 'Missing required \'displayName\'.');
    }

    const mediaType = entry.type;
    if (!mediaType) {
      addError(label, 'Missing required \'type\' (mediaType).');
    } else if (!VALID_MEDIA_TYPES.has(mediaType)) {
      addWarning(
        label,
        `Media type '${mediaType}' is not one of standard discovery types: ` +
          `${Array.from(VALID_MEDIA_TYPES).join(', ')}.`
      );
    }

    const hasUrl = 'url' in entry;
    const hasData = 'data' in entry;
    if (hasUrl && hasData) {
      addError(
        label,
        'Constraint violation: both \'url\' and \'data\' are provided. ' +
          'MUST provide exactly one.'
      );
    } else if (!hasUrl && !hasData) {
      addError(
        label,
        'Constraint violation: neither \'url\' nor \'data\' is provided. ' +
          'MUST provide exactly one.'
      );
    } else if (hasUrl && typeof entry.url === 'string') {
      if (!entry.url.startsWith('https://')) {
        addError(label, 'Insecure HTTP URL found in \'url\'. MUST use https://');
      }
    }

    const queries = entry.representativeQueries;
    if (queries !== undefined && queries !== null) {
      if (!Array.isArray(queries)) {
        addError(label, '\'representativeQueries\' must be an array of strings.');
      } else {
        if (queries.length < 2 || queries.length > 5) {
          addWarning(
            label,
            `'representativeQueries' array has size ${queries.length}. ` +
              '2 to 5 queries are recommended for vector index embedding.'
          );
        }
        for (const q of queries) {
          if (typeof q !== 'string') {
            addError(label, `Query '${q}' is not a string.`);
          }
        }
      }
    } else {
      addWarning(
        label,
        'Missing \'representativeQueries\'. ' +
          'Recommended for vector index embedding.'
      );
    }

    const trust = entry.trustManifest;
    if (trust !== undefined && trust !== null) {
      if (typeof trust !== 'object' || Array.isArray(trust)) {
        addError(label, '\'trustManifest\' must be a JSON object.');
      } else if (!trust.identity) {
        addError(label, '\'trustManifest\' is missing required \'identity\' field.');
      }
    }
  }

  /**
   * @param {any} data
   * @param {function(string, string): void} addError
   * @param {function(string, string): void} addWarning
   */
  static _validateData(data, addError, addWarning) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      addError('Root', 'Manifest root MUST be a JSON object.');
      return;
    }

    this._checkRootProperties(data, addError, addWarning);

    const entries = data.entries;
    if (entries === undefined || entries === null) {
      addError('Root', 'Missing required \'entries\' array.');
    } else if (!Array.isArray(entries)) {
      addError('Root', '\'entries\' must be a JSON array.');
    } else {
      for (let idx = 0; idx < entries.length; idx++) {
        this._checkEntry(entries[idx], idx, addError, addWarning);
      }
    }
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {LH.Audit.Product}
   */
  static audit(artifacts) {
    const ard = artifacts.AgentResourceDiscovery;
    const signals = ard.discoverySignals;

    const hasExplicitSignal = Boolean(
      signals.robotsTxtAgentmap ||
      signals.htmlLink ||
      signals.httpHeaderLink
    );
    const hasCatalog = hasExplicitSignal || ard.status === 200;

    if (!hasCatalog) {
      return {
        score: 1,
        notApplicable: true,
      };
    }

    if (ard.status !== 200 || !ard.content) {
      return {
        score: 0,
        explanation: 'Catalog file could not be loaded for schema validation.',
      };
    }

    /** @type {Array<{element: string, issue: string, severity: 'Error' | 'Warning'}>} */
    const issues = [];
    const addError = (/** @type {string} */ element, /** @type {string} */ msg) => {
      issues.push({element, issue: msg, severity: 'Error'});
    };
    const addWarning = (/** @type {string} */ element, /** @type {string} */ msg) => {
      issues.push({element, issue: msg, severity: 'Warning'});
    };

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      {key: 'element', valueType: 'text', label: 'Element'},
      {key: 'issue', valueType: 'text', label: 'Issue'},
      {key: 'severity', valueType: 'text', label: 'Severity'},
    ];

    let data;
    try {
      data = JSON.parse(ard.content);
    } catch (err) {
      addError('Root', `Malformed JSON in manifest: ${err.message}`);
      return {
        score: 0,
        details: Audit.makeTableDetails(headings, issues),
      };
    }

    this._validateData(data, addError, addWarning);

    const hasErrors = issues.some(i => i.severity === 'Error');
    const hasWarnings = issues.some(i => i.severity === 'Warning');

    let score = 1;
    if (hasErrors) {
      score = 0;
    } else if (hasWarnings) {
      score = 0.5;
    }

    return {
      score,
      details: issues.length ? Audit.makeTableDetails(headings, issues) : undefined,
    };
  }
}

export default ArdSchema;
export {UIStrings};
