/**
 * The paths a host answers, under the base it is served from.
 *
 * Every host asks this of each request: the Node server, the dev server and
 * the service worker, each naming the routes it serves, so none has a route
 * to filter back out. Only the worker of a visitor's catalog
 * serves the catalog, which it is handed on a path of its own.
 */
export type Route = 'graphql' | 'events' | 'rules' | 'catalog';

/** What every host serves: the API, the events it collects, and the rules it keeps. */
export type StoreRoute = Exclude<Route, 'catalog'>;

export const STORE_ROUTES: readonly StoreRoute[] = ['graphql', 'events', 'rules'];

/**
 * Which of the routes a host serves a URL names under its base, parsing it
 * once, or nothing. The answer is one of the routes the host named, so a
 * host that serves no catalog is never handed one.
 */
export const routeOf = <Served extends Route>(
    url: string,
    base: string,
    served: readonly Served[]
): Served | undefined => {
    const { pathname } = new URL(url, 'http://local');
    return served.find((route) => pathname === `${base}${route}`);
};
