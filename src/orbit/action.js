/* eslint-disable valid-jsdoc */
import Orbit from './main';

/**
 `Action` provides a wrapper for actions that are performed in an `ActionQueue`.

 Actions can maintain optional metadata such as `id` and `data`. This metadata
 makes it easier to identify actions within a queue. It can also be used by
 actions themselves during processing.

 Each Action is associated with a function that should be invoked. This function
 can be synchronous or asynchronous.

 `process` wraps the call to the function with a promise.

 Each Action can only succeed once. On failure, the `processing` promise will
 be reset and the action can be tried again.

 @class Action
 @namespace Orbit
 @param {Object}    [options]
 @param {Object}    [options.id] Optional identifier
 @param {Object}    [options.data] Optional data
 @param {Object}    [options.process] A function that performs the action
 @constructor
 */
export default class Action {
  constructor(options) {
    this.id = options.id;
    this.data = options.data;
    this._process = options.process;

    this.reset();
  }

  reset() {
    this.processing = false;

    this.complete = new Orbit.Promise((resolve, reject) => {
      this.didProcess = resolve;
      this.didNotProcess = (e) => {
        this.processing = false;
        reject(e);
      };
    });
  }

  process() {
    if (!this.processing) {
      this.processing = true;

      try {
        let ret = this._process();

        if (ret && ret.then) {
          ret.then(this.didProcess, this.didNotProcess);
        } else {
          this.didProcess(ret);
        }
      } catch (e) {
        this.didNotProcess(e);
      }
    }

    return this.complete;
  }
}
