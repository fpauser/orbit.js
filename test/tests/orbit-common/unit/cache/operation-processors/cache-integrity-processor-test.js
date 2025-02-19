import Schema from 'orbit-common/schema';
import CacheIntegrityProcessor from 'orbit-common/cache/operation-processors/cache-integrity-processor';
import Cache from 'orbit-common/cache';
import KeyMap from 'orbit-common/key-map';
import { identity } from 'orbit-common/lib/identifiers';

let schema, cache, processor;

const schemaDefinition = {
  models: {
    planet: {
      attributes: {
        name: { type: 'string' },
        classification: { type: 'string' }
      },
      relationships: {
        moons: { type: 'hasMany', model: 'moon', inverse: 'planet', actsAsSet: true },
        inhabitants: { type: 'hasMany', model: 'inhabitant', inverse: 'planets' },
        next: { type: 'hasOne', model: 'planet', inverse: 'previous' },
        previous: { type: 'hasOne', model: 'planet', inverse: 'next' }
      }
    },
    moon: {
      attributes: {
        name: { type: 'string' }
      },
      relationships: {
        planet: { type: 'hasOne', model: 'planet', inverse: 'moons' }
      }
    },
    inhabitant: {
      attributes: {
        name: { type: 'string' }
      },
      relationships: {
        planets: { type: 'hasMany', model: 'planet', inverse: 'inhabitants' }
      }
    }
  }
};

module('OC - OperationProcessors - CacheIntegrityProcessor', {
  setup() {
    let keyMap = new KeyMap();
    schema = new Schema(schemaDefinition);
    cache = new Cache({ schema, keyMap, processors: [CacheIntegrityProcessor] });
    processor = cache._processors[0];
  },

  teardown() {
    schema = null;
    cache = null;
    processor = null;
  }
});

test('reset empty cache', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { moons: { data: { 'moon:titan': true } } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                    attributes: { name: 'Jupiter' },
                    relationships: { moons: { data: { 'moon:europa': true } } } };

  const titan = { type: 'moon', id: 'titan',
                  attributes: { name: 'Titan' },
                  relationships: { planet: { data: 'planet:saturn' } } };

  const europa = { type: 'moon', id: 'europa',
                   attributes: { name: 'Europa' },
                   relationships: { planet: { data: 'planet:jupiter' } } };

  cache.reset({
    planet: { saturn, jupiter },
    moon: { titan, europa }
  });

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
        'moon/europa/relationships/planet/data': true
      },
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');
});

test('add to hasOne => hasMany', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { moons: { data: { 'moon:titan': true } } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                    attributes: { name: 'Jupiter' },
                    relationships: { moons: { data: { 'moon:europa': true } } } };

  const titan = { type: 'moon', id: 'titan',
                  attributes: { name: 'Titan' },
                  relationships: { planet: { data: 'planet:saturn' } } };

  const europa = { type: 'moon', id: 'europa',
                   attributes: { name: 'Europa' },
                   relationships: { planet: { data: 'planet:jupiter' } } };

  cache.reset({
    planet: { saturn, jupiter },
    moon: { titan, europa }
  });

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
        'moon/europa/relationships/planet/data': true
      },
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');

  const addPlanetOp = {
    op: 'addToHasMany',
    record: { type: 'moon', id: europa.id },
    relationship: 'planet',
    relatedRecord: { type: 'planet', id: saturn.id }
  };

  assert.deepEqual(
    processor.before(addPlanetOp),
    []
  );

  assert.deepEqual(
    processor.after(addPlanetOp),
    []
  );

  assert.deepEqual(
    processor.finally(addPlanetOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
        'moon/europa/relationships/planet/data': true
      },
      'saturn': {
        'moon/europa/relationships/planet/data': true,
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');
});

test('replace hasOne => hasMany', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { moons: { data: { 'moon:titan': true } } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                    attributes: { name: 'Jupiter' },
                    relationships: { moons: { data: { 'moon:europa': true } } } };

  const titan = { type: 'moon', id: 'titan',
                  attributes: { name: 'Titan' },
                  relationships: { planet: { data: 'planet:saturn' } } };

  const europa = { type: 'moon', id: 'europa',
                   attributes: { name: 'Europa' },
                   relationships: { planet: { data: 'planet:jupiter' } } };

  cache.reset({
    planet: { saturn, jupiter },
    moon: { titan, europa }
  });

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
        'moon/europa/relationships/planet/data': true
      },
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');

  const replacePlanetOp = {
    op: 'replaceHasOne',
    record: europa,
    relationship: 'planet',
    relatedRecord: saturn
  };

  assert.deepEqual(
    processor.before(replacePlanetOp),
    []
  );

  assert.deepEqual(
    processor.after(replacePlanetOp),
    []
  );

  assert.deepEqual(
    processor.finally(
      replacePlanetOp
    ),
    []
  );

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
      },
      'saturn': {
        'moon/europa/relationships/planet/data': true,
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');
});

test('replace hasMany => hasOne with empty array', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { moons: { data: { 'moon:titan': true } } } };

  const titan = { type: 'moon', id: 'titan',
                  attributes: { name: 'Titan' },
                  relationships: { planet: { data: 'planet:saturn' } } };

  cache.reset({
    planet: { saturn },
    moon: { titan }
  });

  assert.deepEqual(processor._rev, {
    'moon': {
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');

  const clearMoonsOp = {
    op: 'replaceHasMany',
    record: saturn,
    relationship: 'moons',
    relatedRecords: []
  };

  assert.deepEqual(
    processor.before(clearMoonsOp),
    []
  );

  assert.deepEqual(
    processor.after(clearMoonsOp),
    []
  );

  assert.deepEqual(
    processor.finally(clearMoonsOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'moon': {
      'titan': {
      }
    },
    'planet': {
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');
});

test('replace hasMany => hasOne with populated array', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { moons: { data: { 'moon:titan': true } } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                    attributes: { name: 'Jupiter' },
                    relationships: { moons: {} } };

  const titan = { type: 'moon', id: 'titan',
                  attributes: { name: 'Titan' },
                  relationships: { planet: { data: 'planet:saturn' } } };

  cache.reset({
    planet: { saturn, jupiter },
    moon: { titan }
  });

  assert.deepEqual(processor._rev, {
    'moon': {
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');

  const replaceMoonsOp = {
    op: 'replaceHasMany',
    record: saturn,
    relationship: 'moons',
    relatedRecords: [{ type: 'moon', id: 'titan' }]
  };

  assert.deepEqual(
    processor.before(replaceMoonsOp),
    []
  );

  assert.deepEqual(
    processor.after(replaceMoonsOp),
    []
  );

  assert.deepEqual(
    processor.finally(replaceMoonsOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'moon': {
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');
});

test('replace hasMany => hasOne with populated array, when already populated', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { moons: { data: { 'moon:titan': true } } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                    attributes: { name: 'Jupiter' },
                    relationships: { moons: { data: { 'moon:europa': true } } } };

  const titan = { type: 'moon', id: 'titan',
                  attributes: { name: 'Titan' },
                  relationships: { planet: { data: 'planet:saturn' } } };

  const europa = { type: 'moon', id: 'europa',
                   attributes: { name: 'Europa' },
                   relationships: { planet: { data: 'planet:jupiter' } } };

  cache.reset({
    planet: { saturn, jupiter },
    moon: { titan, europa }
  });

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
        'moon/europa/relationships/planet/data': true
      },
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');

  const replaceMoonsOp = {
    op: 'replaceHasMany',
    record: saturn,
    relationship: 'moons',
    relatedRecords: [{ type: 'moon', id: 'europa' }]
  };

  assert.deepEqual(
    processor.before(replaceMoonsOp),
    []
  );

  assert.deepEqual(
    processor.after(replaceMoonsOp),
    []
  );

  assert.deepEqual(
    processor.finally(replaceMoonsOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true,
        'planet/saturn/relationships/moons/data/moon:europa': true
      },
      'titan': {}
    },
    'planet': {
      'jupiter': {
        'moon/europa/relationships/planet/data': true
      },
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');
});

test('replace hasMany => hasMany', function(assert) {
  const human = { type: 'inhabitant', id: 'human', relationships: { planets: { data: { 'planet:earth': true } } } };
  const earth = { type: 'planet', id: 'earth', relationships: { inhabitants: { data: { 'inhabitant:human': true } } } };

  cache.reset({
    inhabitant: { human },
    planet: { earth }
  });

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
        'inhabitant/human/relationships/planets/data/planet:earth': true
      }
    },
    'inhabitant': {
      'human': {
        'planet/earth/relationships/inhabitants/data/inhabitant:human': true
      }
    }
  }, 'rev links match');

  const clearInhabitantsOp = {
    op: 'replaceHasMany',
    record: earth,
    relationship: 'inhabitants',
    relatedRecords: []
  };

  assert.deepEqual(
    processor.after(clearInhabitantsOp),
    []
  );

  assert.deepEqual(
    processor.finally(clearInhabitantsOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
        'inhabitant/human/relationships/planets/data/planet:earth': true
      }
    },
    'inhabitant': {
      'human': {
      }
    }
  }, 'rev links match');
});

test('remove hasOne => hasMany', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { moons: { data: { 'moon:titan': true } } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                  attributes: { name: 'Jupiter' },
                  relationships: { moons: { data: { 'moon:europa': true } } } };

  const titan = { type: 'moon', id: 'titan',
                attributes: { name: 'Titan' },
                relationships: { planet: { data: 'planet:saturn' } } };

  const europa = { type: 'moon', id: 'europa',
                   attributes: { name: 'Europa' },
                   relationships: { planet: { data: 'planet:jupiter' } } };

  cache.reset({
    planet: { saturn, jupiter },
    moon: { titan, europa }
  });

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
        'moon/europa/relationships/planet/data': true
      },
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');


  const removePlanetOp = {
    op: 'replaceHasOne',
    record: europa,
    relationship: 'planet',
    relatedRecord: null
  };

  assert.deepEqual(
    processor.before(removePlanetOp),
    []
  );

  assert.deepEqual(
    processor.after(removePlanetOp),
    []
  );

  assert.deepEqual(
    processor.finally(removePlanetOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'moon': {
      'europa': {
        'planet/jupiter/relationships/moons/data/moon:europa': true
      },
      'titan': {
        'planet/saturn/relationships/moons/data/moon:titan': true
      }
    },
    'planet': {
      'jupiter': {
      },
      'saturn': {
        'moon/titan/relationships/planet/data': true
      }
    }
  }, 'rev links match');
});

test('add to hasOne => hasOne', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { next: { data: 'planet:jupiter' } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                    attributes: { name: 'Jupiter' },
                    relationships: { previous: { data: 'planet:saturn' } } };

  const earth = { type: 'planet', id: 'earth',
                  attributes: { name: 'Earth' } };

  cache.reset({
    planet: { saturn, jupiter, earth }
  });

  assert.deepEqual(processor._rev, {
    'planet': {
      'jupiter': {
        'planet/saturn/relationships/next/data': true
      },
      'saturn': {
        'planet/jupiter/relationships/previous/data': true
      }
    }
  }, 'rev links match');

  const changePlanetOp = {
    op: 'replaceHasOne',
    record: earth,
    relationship: 'next',
    relatedRecord: saturn
  };

  assert.deepEqual(
    processor.before(changePlanetOp),
    []
  );

  assert.deepEqual(
    processor.after(changePlanetOp),
    []
  );

  assert.deepEqual(
    processor.finally(changePlanetOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'planet': {
      'jupiter': {
        'planet/saturn/relationships/next/data': true
      },
      'saturn': {
        'planet/earth/relationships/next/data': true,
        'planet/jupiter/relationships/previous/data': true
      }
    }
  }, 'rev links match');
});

test('replace hasOne => hasOne with existing value', function(assert) {
  const saturn = { type: 'planet', id: 'saturn',
                   attributes: { name: 'Saturn' },
                   relationships: { next: { data: 'planet:jupiter' } } };

  const jupiter = { type: 'planet', id: 'jupiter',
                    attributes: { name: 'Jupiter' },
                    relationships: { previous: { data: 'planet:saturn' } } };

  const earth = { type: 'planet', id: 'earth',
                  attributes: { name: 'Earth' } };

  cache.reset({
    planet: { saturn, jupiter, earth }
  });

  assert.deepEqual(processor._rev, {
    'planet': {
      'jupiter': {
        'planet/saturn/relationships/next/data': true
      },
      'saturn': {
        'planet/jupiter/relationships/previous/data': true
      }
    }
  }, 'rev links match');

  const changePlanetOp = {
    op: 'replaceHasOne',
    record: earth,
    relationship: 'next',
    relatedRecord: jupiter
  };

  assert.deepEqual(
    processor.before(changePlanetOp),
    []
  );

  assert.deepEqual(
    processor.after(changePlanetOp),
    []
  );

  assert.deepEqual(
    processor.finally(changePlanetOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'planet': {
      'jupiter': {
        'planet/earth/relationships/next/data': true,
        'planet/saturn/relationships/next/data': true
      },
      'saturn': {
        'planet/jupiter/relationships/previous/data': true
      }
    }
  }, 'rev links match');
});

test('add to hasMany => hasMany', function(assert) {
  const earth = { type: 'planet', id: 'earth' };
  const human = { type: 'inhabitant', id: 'human' };

  cache.reset({
    planet: { earth },
    inhabitant: { human }
  });

  assert.deepEqual(processor._rev, {}, 'empty rev links');

  const addPlanetOp = {
    op: 'addToHasMany',
    record: human,
    relationship: 'planets',
    relatedRecord: earth
  };

  assert.deepEqual(
    processor.before(addPlanetOp),
    []
  );

  assert.deepEqual(
    processor.after(addPlanetOp),
    []
  );

  assert.deepEqual(
    processor.finally(addPlanetOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
        'inhabitant/human/relationships/planets/data/planet:earth': true
      }
    }
  }, 'rev links match');
});

test('remove from hasMany => hasMany', function(assert) {
  const earth = { type: 'planet', id: 'earth', relationships: { inhabitants: { data: { 'inhabitant:human': true } } } };
  const human = { type: 'inhabitant', id: 'human', relationships: { planets: { data: { 'planet:earth': true } } } };

  cache.reset({
    planet: { earth },
    inhabitant: { human }
  });

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
        'inhabitant/human/relationships/planets/data/planet:earth': true
      }
    },
    'inhabitant': {
      'human': {
        'planet/earth/relationships/inhabitants/data/inhabitant:human': true
      }
    }
  }, 'rev links match');

  const removePlanetOp = {
    op: 'removeFromHasMany',
    record: human,
    relationship: 'planets',
    relatedRecord: earth
  };

  assert.deepEqual(
    processor.before(removePlanetOp),
    []
  );

  assert.deepEqual(
    processor.after(removePlanetOp),
    []
  );

  assert.deepEqual(
    processor.finally(removePlanetOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
      }
    },
    'inhabitant': {
      'human': {
        'planet/earth/relationships/inhabitants/data/inhabitant:human': true
      }
    }
  }, 'rev links match');
});

test('remove record with hasMany relationships', function(assert) {
  const earth = { type: 'planet', id: 'earth', relationships: { inhabitants: { data: { 'inhabitant:human': true } } } };
  const human = { type: 'inhabitant', id: 'human', relationships: { planets: { data: { 'planet:earth': true } } } };

  cache.reset({
    planet: { earth },
    inhabitant: { human }
  });

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
        'inhabitant/human/relationships/planets/data/planet:earth': true
      }
    },
    'inhabitant': {
      'human': {
        'planet/earth/relationships/inhabitants/data/inhabitant:human': true
      }
    }
  }, 'rev links match');

  const removeInhabitantOp = {
    op: 'removeRecord',
    record: human
  };

  assert.deepEqual(
    processor.before(removeInhabitantOp),
    []
  );

  assert.deepEqual(
    processor.after(removeInhabitantOp),
    [
      {
        op: 'removeFromHasMany',
        record: identity(earth),
        relationship: 'inhabitants',
        relatedRecord: identity(human)
      }
    ]
  );

  assert.deepEqual(
    processor.finally(removeInhabitantOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
      }
    },
    'inhabitant': {
    }
  }, 'rev links match');
});

test('replaceRecord', function(assert) {
  const earth = { type: 'planet', id: 'earth' };
  const human = { type: 'inhabitant', id: 'human' };

  cache.reset({
    planet: { earth },
    inhabitant: { human }
  });

  assert.deepEqual(processor._rev, {}, 'empty rev links');

  const humanOnEarth = {
    type: 'inhabitant',
    id: 'human',
    relationships: {
      planets: { data: { 'planet:earth': true } }
    }
  };

  const replaceHumanOp = {
    op: 'replaceRecord',
    record: humanOnEarth
  };

  assert.deepEqual(
    processor.before(replaceHumanOp),
    []
  );

  assert.deepEqual(
    processor.after(replaceHumanOp),
    []
  );

  assert.deepEqual(
    processor.finally(replaceHumanOp),
    []
  );

  assert.deepEqual(processor._rev, {
    'planet': {
      'earth': {
        'inhabitant/human/relationships/planets/data/planet:earth': true
      }
    }
  }, 'rev links match');
});
