const { Actor } = require('apify');
const { RequestQueue, CheerioCrawler, Dataset } = require('crawlee');

const main = async () => {
    // 1. Inicializar o ambiente do Actor
    await Actor.init();
    
    // 2. Obter a URL de entrada
    const input = await Actor.getInput();
    const startUrl = input.url;
    
    if (!startUrl) {
        console.log('Nenhuma URL fornecida. Por favor, forneça uma URL como input.');
        await Actor.exit();
        return;
    }
    
    console.log(`Iniciando o web scraping para a URL: ${startUrl}`);
    
    // Usar a classe RequestQueue em vez da função openRequestQueue
    const requestQueue = await RequestQueue.open();
    await requestQueue.addRequest({ url: startUrl });
    
    // 3. Criar o CheerioCrawler
    const crawler = new CheerioCrawler({
        requestQueue,
        // Define a lógica para cada página que o crawler visita
        requestHandler: async ({ request, $ }) => {
            const pageTitle = $('title').text();
            console.log(`Processando a página: ${pageTitle}`);
            
            // Encontra todos os anúncios de imóveis na página
            $('.item-info-container').each(async (i, el) => {
                const item = $(el);
                
                // 4. Extrair os dados de cada anúncio
                const title = item.find('h2 a').text().trim();
                const link = 'https://www.idealista.pt' + item.find('h2 a').attr('href');
                const price = item.find('.item-price').text().trim();
                const rooms = item.find('.item-detail').eq(0).text().trim();
                const size = item.find('.item-detail').eq(1).text().trim();
                const location = item.find('.item-location').text().trim();
                
                // Usar Dataset.pushData em vez de pushData
                await Dataset.pushData({
                    title,
                    price,
                    link,
                    rooms,
                    size,
                    location,
                    scrapedAt: new Date().toISOString()
                });
            });
            
            // 5. Adicionar a próxima página à fila (se existir)
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
    
    // 6. Sair do Actor
    await Actor.exit();
};

main().catch(console.error);
