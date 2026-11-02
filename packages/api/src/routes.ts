/**
 * The paths a host answers, under the base it is served from.
 *
 * Every host asks this once for each request: the Node server, the dev
 * server and the service worker. Each then answers the routes it serves.
 * The worker of a visitor's catalog also takes a catalog on its own path,
 * which the other hosts leave alone.
 */
export type Route = 'graphql' | 'events' | 'rules' | 'catalog';

const ROUTES: readonly Route[] = ['graphql', 'events', 'rules', 'catalog'];

/** Which route a URL names under the base, parsing it once, or nothing. */
export const routeOf = (url: string, base = '/'): Route | undefined => {
    const { pathname } = new URL(url, 'http://local');
    return ROUTES.find((route) => pathname === `${base}${route}`);
};
