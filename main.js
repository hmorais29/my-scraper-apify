const Apify = require('apify');

const main = async () => {
    // 1. Inicializar o ambiente do Actor. Isto é crucial!
    await Apify.Actor.init();

    // 2. Obter a URL de entrada
    const input = await Apify.Actor.getInput();
    const startUrl = input.url;

    if (!startUrl) {
        console.log('Nenhuma URL fornecida. Por favor, forneça uma URL como input.');
        await Apify.Actor.exit();
        return;
    }

    console.log(`Iniciando o web scraping para a URL: ${startUrl}`);

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: startUrl });

    // 3. Criar o CheerioCrawler
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        // Define a lógica para cada página que o crawler visita
        handlePageFunction: async ({ request, $ }) => {
            const pageTitle = $('title').text();
            console.log(`Processando a página: ${pageTitle}`);

            // Encontra todos os anúncios de imóveis na página
            $('.item-info-container').each((i, el) => {
                const item = $(el);

                // 4. Extrair os dados de cada anúncio
                const title = item.find('h2 a').text().trim();
                const link = 'https://www.idealista.pt' + item.find('h2 a').attr('href');
                const price = item.find('.item-price').text().trim();
                const rooms = item.find('.item-detail').eq(0).text().trim();
                const size = item.find('.item-detail').eq(1).text().trim();
                const location = item.find('.item-location').text().trim();

                // 5. Guardar os dados num formato estruturado
                Apify.pushData({
                    title,
                    price,
                    link,
                    rooms,
                    size,
                    location,
                    scrapedAt: new Date().toISOString()
                });
            });

            // 6. Adicionar a próxima página à fila (se existir)
            const nextButton = $('a.next-page');
            if (nextButton.length) {
                const nextPageUrl = 'https://www.idealista.pt' + nextButton.attr('href');
                console.log(`Encontrada próxima página: ${nextPageUrl}`);
                await requestQueue.addRequest({ url: nextPageUrl });
            }
        },
    });

    // Iniciar o crawler
    await crawler.run();
    console.log('Web scraping concluído com sucesso!');

    // 7. Sair do Actor
    await Apify.Actor.exit();
};

main();
