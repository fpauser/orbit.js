/* eslint-disable valid-jsdoc */
import Orbit from 'orbit/main';
import { assert } from 'orbit/lib/assert';
import Fetchable from 'orbit/fetchable';
import Updatable from 'orbit/updatable';
import Source from './source';
import Serializer from './serializer';
import JSONAPISerializer from './jsonapi/serializer';
import { getFetchRequests, FetchRequestProcessors } from './jsonapi/fetch-requests';
import { getTransformRequests, TransformRequestProcessors } from './jsonapi/transform-requests';
import { FetchNotAllowed, TransformNotAllowed } from './lib/exceptions';

/**
 Source for accessing a JSON API compliant RESTful API with AJAX.

 If a single transform or fetch operation requires more than one ajax request,
 requests will be performed sequentially and resolved together. From the
 perspective of Orbit, these operations will all succeed or fail together. The
 `maxRequestsPerTransform` and `maxRequestsPerFetch` options allow limits to be
 set on this behavior. These options should be set to `1` if your client/server
 configuration is unable to resolve partially successful transforms / fetches.

 @class JSONAPISource
 @extends Source
 @namespace OC
 @param {Object}    [options]
 @param {OC.Schema} [options.schema] Schema for source (required)
 @param {Number}    [options.maxRequestsPerFetch] Maximum number of AJAX requests allowed per fetch.
 @param {Number}    [options.maxRequestsPerTransform] Maximum number of AJAX requests allowed per transform.
 @constructor
 */
export default class JSONAPISource extends Source {
  constructor(options = {}) {
    assert('JSONAPISource\'s `schema` must be specified in `options.schema` constructor argument', options.schema);
    assert('JSONAPISource\'s `keyMap` must be specified in `options.keyMap` constructor argument', options.keyMap);
    assert('JSONAPISource requires Orbit.Promise be defined', Orbit.Promise);
    assert('JSONAPISource requires Orbit.ajax be defined', Orbit.ajax);

    super(options);

    this.name             = options.name || 'jsonapi';
    this.namespace        = options.namespace;
    this.host             = options.host;
    this.headers          = options.headers || { Accept: 'application/vnd.api+json' };

    this.maxRequestsPerFetch     = options.maxRequestsPerFetch;
    this.maxRequestsPerTransform = options.maxRequestsPerTransform;

    const SerializerClass = options.SerializerClass || JSONAPISerializer;
    this.serializer       = new SerializerClass({ schema: options.schema, keyMap: options.keyMap });

    assert('Serializer must be an instance of OC.Serializer', this.serializer instanceof Serializer);
  }

  /////////////////////////////////////////////////////////////////////////////
  // Transformable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  _transform(transform) {
    const requests = getTransformRequests(transform);

    if (this.maxRequestsPerTransform && requests.length > this.maxRequestsPerTransform) {
      return Orbit.Promise.resolve()
        .then(() => {
          throw new TransformNotAllowed(
            `This transform requires ${requests.length} requests, which exceeds the specified limit of ${this.maxRequestsPerTransform} requests per transform.`,
            transform);
        });
    }

    return this._processRequests(requests, TransformRequestProcessors)
      .then(transforms => {
        transforms.unshift(transform);
        return transforms;
      });
  }

  /////////////////////////////////////////////////////////////////////////////
  // Fetchable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  _fetch(query) {
    const requests = getFetchRequests(query);

    if (this.maxRequestsPerFetch && requests.length > this.maxRequestsPerFetch) {
      return Orbit.Promise.resolve()
        .then(() => {
          throw new FetchNotAllowed(
            `This query requires ${requests.length} fetch requests, which exceeds the specified limit of ${this.maxRequestsPerFetch} requests per query.`,
            query);
        });
    }

    return this._processRequests(requests, FetchRequestProcessors);
  }

  /////////////////////////////////////////////////////////////////////////////
  // Publicly accessible methods particular to JSONAPISource
  /////////////////////////////////////////////////////////////////////////////

  ajax(url, method, settings = {}) {
    return new Orbit.Promise((resolve, reject) => {
      settings.url = url;
      settings.type = method;
      settings.dataType = 'json';
      settings.context = this;

      if (settings.data && method !== 'GET') {
        if (!settings.contentType) {
          settings.contentType = this.ajaxContentType(settings);
        }
        settings.data = JSON.stringify(settings.data);
      }

      if (!settings.headers) {
        settings.headers = this.ajaxHeaders(settings);
      }

      settings.success = function(json) {
        resolve(json);
      };

      settings.error = function(jqXHR) {
        if (jqXHR) {
          jqXHR.then = null;
        }
        reject(jqXHR);
      };

      Orbit.ajax(settings);
    });
  }

  ajaxContentType(/* settings */) {
    return 'application/vnd.api+json; charset=utf-8';
  }

  ajaxHeaders(/* settings */) {
    return this.headers;
  }

  resourceNamespace(/* type */) {
    return this.namespace;
  }

  resourceHost(/* type */) {
    return this.host;
  }

  resourcePath(type, id) {
    let path = [this.serializer.resourceType(type)];
    if (id) {
      let resourceId = this.serializer.resourceId(type, id);
      if (resourceId) {
        path.push(resourceId);
      }
    }
    return path.join('/');
  }

  resourceURL(type, id) {
    let host = this.resourceHost(type);
    let namespace = this.resourceNamespace(type);
    let url = [];

    if (host) { url.push(host); }
    if (namespace) { url.push(namespace); }
    url.push(this.resourcePath(type, id));

    url = url.join('/');
    if (!host) { url = '/' + url; }

    return url;
  }

  resourceRelationshipURL(type, id, relationship) {
    return this.resourceURL(type, id) +
           '/relationships/' + this.serializer.resourceRelationship(type, relationship);
  }

  relatedResourceURL(type, id, relationship) {
    return this.resourceURL(type, id) +
           '/' + this.serializer.resourceRelationship(type, relationship);
  }

  /////////////////////////////////////////////////////////////////////////////
  // Private methods
  /////////////////////////////////////////////////////////////////////////////

  _processRequests(requests, processors) {
    let transforms = [];
    let result = Orbit.Promise.resolve();

    requests.forEach(request => {
      let processor = processors[request.op];

      result = result.then(() => {
        return processor(this, request)
          .then(additionalTransforms => {
            if (additionalTransforms) {
              Array.prototype.push.apply(transforms, additionalTransforms);
            }
          });
      });
    });

    return result.then(() => transforms);
  }
}

Fetchable.extend(JSONAPISource.prototype);
Updatable.extend(JSONAPISource.prototype); // implicitly extends Transformable
