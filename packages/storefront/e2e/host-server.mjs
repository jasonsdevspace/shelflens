import { createServer } from 'node:http';

/**
 * A page the store does not serve, from an origin of its own, for the
 * embed test. It loads the widget's file from the demo and asks the Node
 * server, so every request the box makes crosses an origin. A page a test
 * makes up in the browser would not do: the browser treats a page with no
 * address of its own as public and refuses to let it reach a loopback
 * address, which is right, and which a real page on a real server is not.
 */

const port = Number(process.env.PORT ?? 4175);
const demo = process.env.DEMO ?? 'http://localhost:4173/';
const api = process.env.API ?? 'http://127.0.0.1:4174/graphql';

const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>A store's own page</title></head>
<body>
<h1>Our shop</h1>
<div id="search"></div>
<script type="module">
    import { mountShelfLens } from '${demo}widget.js';
    mountShelfLens(document.getElementById('search'), {
        apiUrl: '${api}',
        storeUrl: '${demo}',
    });
</script>
</body>
</html>
`;

createServer((request, response) => {
    if (request.url !== '/') {
        response.writeHead(404);
        response.end();
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
}).listen(port);
