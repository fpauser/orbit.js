import { planetsSchema } from 'tests/test-helper';
import Coordinator from 'orbit-common/coordinator';
import SyncStrategy from 'orbit-common/strategies/sync-strategy';
import RequestStrategy from 'orbit-common/strategies/request-strategy';
import Store from 'orbit-common/store';
import JsonApiSource from 'orbit-common/jsonapi-source';
import LocalStorageSource from 'orbit-common/local-storage-source';
import { eq } from 'orbit/lib/eq';
import qb from 'orbit-common/query/builder';
import KeyMap from 'orbit-common/key-map';
import {
  addRecord,
  replaceRecord,
  removeRecord,
  // replaceKey,
  // replaceAttribute,
  addToHasMany,
  removeFromHasMany,
  replaceHasMany,
  replaceHasOne
} from 'orbit-common/transform/operators';
import {
  verifyLocalStorageContainsRecord,
  verifyLocalStorageDoesNotContainRecord
} from 'tests/test-helper';

let server;

const stubbedResponses = {
  planetAdded: [
    201,
    { 'Content-Type': 'application/json' },
    JSON.stringify({ data: { type: 'planets', id: '12345', attributes: { name: 'Pluto', classification: 'gas giant' } } })
  ],
  planetAddFailed: [
    422,
    { 'Content-Type': 'application/json' },
    JSON.stringify(
      {
        'errors': [
          {
            status: 422,
            source: {
              pointer: 'data/attributes/name'
            },
            title: 'Invalid Attribute',
            detail: 'Pluto isn\'t really a planet!'
          }
        ]
      }
    )
  ],
  deletePlanet: [
    200,
    { 'Content-Type': 'application/json' },
    JSON.stringify({})
  ]
};

function onAddPlutoRequest(response) {
  server.respondWith('POST', '/planets', (xhr) => {
    const body = JSON.parse(xhr.requestBody);

    if (body.data.attributes.name === 'Pluto') {
      xhr.respond(...response);
    }
  });
}

function wasRequested(method, url, json) {
  const result = server.requests.find(request => {
    const methodMatches = request.method === method;
    const urlMatches = request.url === url;
    const jsonMatches = json ? eq(JSON.parse(request.requestBody), json) : true;
    return methodMatches && urlMatches && jsonMatches;
  });

  return !!result;
}

function jsonResponse(status, json) {
  return [
    status,
    { 'Content-Type': 'application/json' },
    JSON.stringify(json)
  ];
}

module('Integration - Coordinator', function(hooks) {
  let store;
  let localStorage;
  let jsonApiSource;
  let coordinator;
  let updateRequestStrategy;
  let queryRequestStrategy;
  let localBackupStrategy;

  hooks.beforeEach(function() {
    server = sinon.fakeServer.create();
    server.autoRespond = true;

    let keyMap = new KeyMap();
    coordinator = new Coordinator();
    jsonApiSource = new JsonApiSource({ schema: planetsSchema, keyMap: new KeyMap() });
    store = new Store({ schema: planetsSchema, keyMap });
    localStorage = new LocalStorageSource({ schema: planetsSchema, keyMap });

    coordinator.addNode('master', {
      sources: [store]
    });

    coordinator.addNode('backup', {
      sources: [localStorage]
    });

    coordinator.addNode('upstream', {
      sources: [jsonApiSource]
    });

    updateRequestStrategy = new RequestStrategy({
      coordinator,
      sourceNode: 'master',
      targetNode: 'upstream',
      sourceEvent: 'beforeUpdate',
      targetRequest: 'update',
      blocking: true,
      syncResults: true
    });

    queryRequestStrategy = new RequestStrategy({
      coordinator,
      sourceNode: 'master',
      targetNode: 'upstream',
      sourceEvent: 'beforeQuery',
      targetRequest: 'fetch',
      blocking: true,
      syncResults: true
    });

    localBackupStrategy = new SyncStrategy({
      coordinator,
      sourceNode: 'master',
      targetNode: 'backup',
      blocking: false
    });
  });

  hooks.afterEach(function() {
    updateRequestStrategy.deactivate();
    queryRequestStrategy.deactivate();
    localBackupStrategy.deactivate();

    localStorage.reset();
    server.restore();
  });

  test('#update - addRecord', function(assert) {
    assert.expect(2);

    let record = { type: 'planet', attributes: { name: 'Pluto' } };

    onAddPlutoRequest(stubbedResponses.planetAdded);

    return store.update(addRecord(record))
      .then(() => {
        assert.equal(store.cache.get(['planet', record.id, 'attributes', 'name']), 'Pluto', 'record matches');
        verifyLocalStorageContainsRecord(localStorage, record);
      });
  });

  test('#update - addRecord - error', function(assert) {
    assert.expect(2);

    let record = { type: 'planet', attributes: { name: 'Pluto' } };

    onAddPlutoRequest(stubbedResponses.planetAddFailed);

    return store.update(addRecord(record))
      .catch(error => {
        assert.equal(error.responseJSON.errors[0].detail, 'Pluto isn\'t really a planet!');
        verifyLocalStorageDoesNotContainRecord(localStorage, record);
      });
  });

  test('#update - replaceRecord', function(assert) {
    assert.expect(2);

    const pluto = { type: 'planet', id: 'pluto', attributes: { name: 'Pluto', classification: 'superior' } };
    const pluto2 = { type: 'planet', id: 'pluto', keys: { remoteId: 'pluto2' }, attributes: { name: 'Pluto2', classification: 'gas giant' } };

    store.cache.patch(
      addRecord(pluto)
    );

    server.respondWith('PATCH', '/planets/pluto', jsonResponse(200, {}));

    return store.update(replaceRecord(pluto2))
      .then(() => {
        assert.equal(store.cache.get(['planet', 'pluto', 'attributes', 'name']), 'Pluto2', 'record matches');
        verifyLocalStorageContainsRecord(localStorage, pluto2);
      });
  });

  test('#update - removeRecord', function(assert) {
    assert.expect(3);

    const pluto = { type: 'planet', id: 'pluto' };

    server.respondWith('DELETE', '/planets/pluto', stubbedResponses.deletePlanet);

    store.cache.patch(addRecord(pluto));

    return store.update(removeRecord(pluto))
      .then(() => {
        assert.notOk(store.cache.has(['planet', 'pluto']), 'cache updated');
        assert.ok(wasRequested('DELETE', '/planets/pluto'), 'server updated');
        verifyLocalStorageDoesNotContainRecord(localStorage, pluto);
      });
  });

  test('#update - addToHasMany', function(assert) {
    assert.expect(2);

    const jupiter = { type: 'planet', id: 'jupiter' };
    const io = { type: 'moon', id: 'io' };

    store.cache.patch([
      addRecord(jupiter),
      addRecord(io)
    ]);

    server.respondWith('POST', '/planets/jupiter/relationships/moons', jsonResponse(200, {}));

    return store.update(addToHasMany(jupiter, 'moons', io))
      .then(() => {
        const cacheJupiter = store.cache.get(['planet', 'jupiter']);
        assert.deepEqual(cacheJupiter.relationships.moons.data, { 'moon:io': true }, 'cache updated');
        assert.ok(wasRequested('POST', '/planets/jupiter/relationships/moons'), 'server updated');
      });
  });

  test('#update - removeFromHasMany', function(assert) {
    assert.expect(2);

    const jupiter = { type: 'planet', id: 'jupiter' };
    const io = { type: 'moon', id: 'io' };

    store.cache.patch([
      addRecord(jupiter),
      addRecord(io),
      addToHasMany(jupiter, 'moons', io)
    ]);

    server.respondWith('DELETE', '/planets/jupiter/relationships/moons', jsonResponse(200, {}));

    return store.update(removeFromHasMany(jupiter, 'moons', io))
      .then(() => {
        const cacheJupiter = store.cache.get(['planet', 'jupiter']);
        assert.deepEqual(cacheJupiter.relationships.moons.data, {}, 'cache updated');
        assert.ok(wasRequested('DELETE', '/planets/jupiter/relationships/moons', { data: [{ type: 'moons', id: 'io' }] }), 'server updated');
      });
  });

  test('#update - replaceHasOne', function(assert) {
    assert.expect(2);

    const earth = { type: 'planet', id: 'earth' };
    const jupiter = { type: 'planet', id: 'jupiter' };
    const io = { type: 'moon', id: 'io' };
    const requestBody = { data: { id: 'io', type: 'moons', relationships: { planet: { data: { type: 'planets', id: 'earth' } } } } };

    store.cache.patch([
      addRecord(earth),
      addRecord(jupiter),
      addRecord(io),
      replaceHasOne(io, 'planet', jupiter)
    ]);

    server.respondWith('PATCH', '/moons/io', jsonResponse(200, {}));

    return store.update(replaceHasOne(io, 'planet', earth))
      .then(() => {
        const cacheIo = store.cache.get(['moon', 'io']);
        assert.deepEqual(cacheIo.relationships.planet.data, 'planet:earth', 'updated cache');
        assert.ok(wasRequested('PATCH', '/moons/io', requestBody), 'server updated');
      });
  });

  test('#update - replaceHasMany', function(assert) {
    assert.expect(2);

    const jupiter = { type: 'planet', id: 'jupiter' };
    const io = { type: 'moon', id: 'io' };
    const europa = { type: 'moon', id: 'europa' };
    const expectedRequestBody = { data: { id: 'jupiter', type: 'planets', relationships: { moons: { data: [{ type: 'moons', id: 'io' }, { type: 'moons', id: 'europa' }] } } } };

    store.cache.patch([
      addRecord(jupiter),
      addRecord(io),
      addRecord(europa)
    ]);

    server.respondWith('PATCH', '/planets/jupiter', jsonResponse(200, {}));

    return store.update(replaceHasMany(jupiter, 'moons', [io, europa]))
      .then(() => {
        const cacheJupiter = store.cache.get(['planet', 'jupiter']);
        assert.deepEqual(cacheJupiter.relationships.moons.data, { 'moon:io': true, 'moon:europa': true });
        assert.ok(wasRequested('PATCH', '/planets/jupiter', expectedRequestBody), 'server updated');
      });
  });

  QUnit.skip('replaceKey', function(assert) {
    return store.replaceKey({ type: 'planet', id: 'pluto' }, 'remoteId', 'abc1234')
      .then(() => {
        const record = store.cache.get(['planet', 'pluto']);
        assert.equal(record.remoteId, 'abc1234', 'key updated on record');
        assert.ok(wasRequested(''));
      });
  });

  test('find records of a particular type', function(assert) {
    assert.expect(1);

    const data = [
      { type: 'planets', attributes: { name: 'Jupiter', classification: 'gas giant' } }
    ];

    server.respondWith('GET', '/planets', jsonResponse(200, { data }));

    return store.query(qb.records('planet'))
      .then(planets => {
        assert.deepEqual(Object.keys(planets).map(k => planets[k].attributes.name), ['Jupiter']);
      });
  });

  test('find an individual record', function(assert) {
    assert.expect(3);

    const data = { type: 'planets', id: '12345', attributes: { name: 'Jupiter', classification: 'gas giant' } };

    server.respondWith('GET', '/planets/12345', jsonResponse(200, { data }));

    return store
      .query(qb.record({ type: 'planet', id: '12345' }))
      .then(record => {
        assert.equal(record.type, 'planet');
        assert.equal(record.id, '12345');
        assert.equal(record.attributes.name, 'Jupiter');
      });
  });

  test('find records of a particular type using a filter', function(assert) {
    assert.expect(1);

    const data = [
      { type: 'planets', attributes: { name: 'Jupiter', classification: 'gas giant' } }
    ];

    server.respondWith('GET', `/planets?${encodeURIComponent('filter[name]')}=Jupiter`, jsonResponse(200, { data }));

    return store
      .query(qb.records('planet')
               .filterAttributes({ name: 'Jupiter' }))
      .then(planets => {
        assert.deepEqual(Object.keys(planets).map(k => planets[k].attributes.name), ['Jupiter']);
      });
  });
});
