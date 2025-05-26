const Apify = require('apify');

Apify.main(async () => {
    const input = await Apify.getInput();
    const { searchQuery, maxPages = 3, resultsPerPage = 10, useProxy = true } = input;

    if (!searchQuery) throw new Error('Input missing "searchQuery" field!');

    const requestQueue = await Apify.openRequestQueue();
    for (let start = 0; start < maxPages * resultsPerPage; start += resultsPerPage) {
        await requestQueue.addRequest({
            url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${resultsPerPage}&start=${start}`,
            userData: { label: 'SEARCH', page: (start / resultsPerPage) + 1 },
        });
    }

    const results = [];
    const blockedKeywords = ['unusual traffic', 'sorry', 'captcha', 'detected'];

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useSessionPool: true,
        sessionPoolOptions: { maxPoolSize: 20 },
        maxRequestRetries: 5,
        proxyConfiguration: useProxy ? await Apify.createProxyConfiguration() : undefined,
        preNavigationHooks: [
            async ({ request, session }, gotoOptions) => {
                // Block loading images, CSS, and scripts for speed and stealth
                gotoOptions.blockResources = ['stylesheet', 'media', 'font', 'image', 'script'];
            },
        ],
        handlePageFunction: async ({ request, $, body, session }) => {
            const bodyText = body.toLowerCase();
            if (blockedKeywords.some(kw => bodyText.includes(kw))) {
                session.markBad();
                throw new Error('Blocked by Google or CAPTCHA detected.');
            }

            $('div.g, div.MjjYud').each((_, el) => {
                const $el = $(el);
                const title = $el.find('h3').first().text().trim();
                const url = $el.find('a').first().attr('href');
                const snippet = $el.find('.VwiC3b, .IsZvec').first().text().trim();
                if (title && url && !url.startsWith('/')) {
                    results.push({
                        page: request.userData.page,
                        title,
                        url,
                        snippet,
                    });
                }
            });
            console.log(`Scraped page ${request.userData.page} of results.`);
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times.`);
        },
    });

    await crawler.run();
    await Apify.pushData(results);
});
