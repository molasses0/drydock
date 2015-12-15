import { each, cloneDeep } from "lodash";
import { Server } from "hapi";

import { version } from "../../package.json";

import * as schemas from "./schemas";
import nodeApi from "./node-api";
import defineApiRoutes from "./routes/api";
import defineInstanceRoutes from "./routes/instance";
import text from "./util/text";
import log from "./util/log";
import * as Errors from "./errors";


const invalidRoute = /^\/drydock\//;


export default class Drydock {
  constructor (options = {}) {
    Object.assign(this, {
      port: options.port || 1337,
      ip: options.ip || "0.0.0.0",
      verbose: !!options.verbose,
      cors: !!options.cors,
      cookieEncoding: options.cookieEncoding || "none",
      _initial: {
        state: options.initialState || {},
        routes: [],
        staticRoutes: [],
        hapiRoutes: []
      }
    });
  }

  _assertValidRoute (routeCfg) {
    this._initial.routes.forEach(route => {
      if (routeCfg.name === route.name) {
        throw new Errors.ConfigurationError(
          `Route with name '${routeCfg.name}' is already defined.`
        );
      }
      if (invalidRoute.test(routeCfg.path)) {
        throw new Errors.ConfigurationError(
          `Route with path '${routeCfg.path}' is invalid.`
        );
      }
    });
  }

  jsonRoute (routeCfg) {
    schemas.validateConfig(schemas.route, routeCfg);
    this._assertValidRoute(routeCfg);
    each(routeCfg.handlers, handler => schemas.validateConfig(schemas.handler, handler));
    this._initial.routes.push(Object.assign({}, routeCfg, { type: "application/json" }));
  }

  htmlRoute (routeCfg) {
    schemas.validateConfig(schemas.route, routeCfg);
    this._assertValidRoute(routeCfg);
    each(routeCfg.handlers, handler => schemas.validateConfig(schemas.handler, handler));
    this._initial.routes.push(Object.assign({}, routeCfg, { type: "text/html" }));
  }

  hapiRoute (routeCfg) {
    this._initial.hapiRoutes.push(routeCfg);
  }

  staticDir (staticCfg) {
    schemas.validateConfig(schemas.staticRoute, staticCfg);
    this._initial.staticRoutes.push(Object.assign(staticCfg, { type: "directory" }));
  }

  staticFile (staticCfg) {
    schemas.validateConfig(schemas.staticRoute, staticCfg);
    this._initial.staticRoutes.push(Object.assign(staticCfg, { type: "file" }));
  }

  start (cb) {
    log(`starting drydock ${version} server on ${this.ip}:${this.port}...`);

    this.server = new Server(this.ip, this.port, {
      router: { stripTrailingSlash: true },
      cors: this.cors,
      state: { cookies: { failAction: "ignore" } }
    });

    defineApiRoutes(this);
    defineInstanceRoutes(this);

    if (this.verbose) {
      this.server.on("response", request => {
        let action = text("RTE").green().pad(1);
        if (request.route.path.indexOf("/drydock") === 0) { action = text("SUR").bright().pad(1); }
        log(`${text(request.method.toUpperCase()).rightJustify(5)}${action}${request.path}`);
      });
    }

    this.reset(false, () => this.server.start(cb));
  }

  stop (cb) {
    log("stopping server...");
    this.server.stop(cb);
  }

  reset (logReset, cb) {
    if (logReset) { log("resetting to initial state..."); }

    Object.assign(this, {
      routes: cloneDeep(this._initial.routes),
      staticRoutes: cloneDeep(this._initial.staticRoutes),
      hapiRoutes: cloneDeep(this._initial.hapiRoutes),
      state: cloneDeep(this._initial.state)
    });

    for (const route of this.routes) {
      route.selectedHandler = route.selectedHandler || Object.keys(route.handlers)[0];

      for (const handlerName of Object.keys(route.handlers)) {
        const handler = route.handlers[handlerName];
        if (handler.optionsType === "selectOne") {
          handler.selectedOption = handler.selectedOption || Object.keys(handler.options)[0];
        }
        if (handler.optionsType === "selectMany") {
          handler.selectedOptions = handler.selectedOptions || [];
        }
      }
    }

    this.delay = 0;
    this.state = cloneDeep(this._initial.state);

    cb && cb();
  }
}

Drydock.Errors = Errors;

Object.assign(Drydock.prototype, nodeApi);
