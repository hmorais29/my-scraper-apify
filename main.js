const { Actor } = require('apify');
const { RequestQueue, CheerioCrawler, Dataset, ProxyConfiguration } = require('crawlee');

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
    
    // Configurar proxy
    const proxyConfiguration = new ProxyConfiguration({
        groups: ['RESIDENTIAL'],
    });
    
    // Usar a classe RequestQueue
    const requestQueue = await RequestQueue.open();
    await requestQueue.addRequest({ url: startUrl });
    
    // 3. Criar o CheerioCrawler básico
    const crawler = new CheerioCrawler({
        requestQueue,
        proxyConfiguration,
        maxRequestRetries: 2,
        maxConcurrency: 1, // Uma request de cada vez
        // Define a lógica para cada página que o crawler visita
        requestHandler: async ({ request, $, response }) => {
            console.log(`Status: ${response.statusCode} - Processando: ${request.url}`);
            const pageTitle = $('title').text();
            console.log(`Título da página: ${pageTitle}`);
            
            // Verificar se chegámos à página correta
            if (!$('.item-info-container').length) {
                console.log('Não foram encontrados anúncios com .item-info-container');
                // Tentar outros seletores comuns do Idealista
                const alternativeSelectors = ['.item', '.property-item', '[data-element-id]', '.ad-preview'];
                let found = false;
                
                for (const selector of alternativeSelectors) {
                    const elements = $(selector);
                    if (elements.length > 0) {
                        console.log(`Encontrados ${elements.length} elementos com seletor: ${selector}`);
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    console.log('HTML snippet (primeiros 500 chars):');
                    console.log($.html().substring(0, 500));
                }
                return;
            }
            
            // Encontra todos os anúncios de imóveis na página
            const properties = [];
            $('.item-info-container').each((i, el) => {
                const item = $(el);
                
                // 4. Extrair os dados de cada anúncio
                const title = item.find('h2 a, .item-link').text().trim();
                const linkHref = item.find('h2 a, .item-link').attr('href');
                const link = linkHref ? 'https://www.idealista.pt' + linkHref : '';
                const price = item.find('.item-price').text().trim();
                const rooms = item.find('.item-detail').eq(0).text().trim();
                const size = item.find('.item-detail').eq(1).text().trim();
                const location = item.find('.item-location').text().trim();
                
                if (title || price) { // Só adicionar se encontrou pelo menos título ou preço
                    properties.push({
                        title,
                        price,
                        link,
                        rooms,
                        size,
                        location,
                        scrapedAt: new Date().toISOString(),
                        sourceUrl: request.url
                    });
                }
            });
            
            console.log(`Encontrados ${properties.length} imóveis nesta página`);
            
            // Guardar os dados
            if (properties.length > 0) {
                await Dataset.pushData(properties);
            }
            
            // 5. Adicionar a próxima página à fila (se existir)
            const nextButton = $('a.next-page, .icon-arrow-right-after').parent('a');
            if (nextButton.length) {
                const nextPageHref = nextButton.attr('href');
                if (nextPageHref) {
                    const nextPageUrl = 'https://www.idealista.pt' + nextPageHref;
                    console.log(`Encontrada próxima página: ${nextPageUrl}`);
                    await requestQueue.addRequest({ url: nextPageUrl });
                }
            } else {
                console.log('Não foi encontrada próxima página');
            }
            
            // Adicionar delay entre páginas
            await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
        },
        
        // Configurar headers
        requestHandlerTimeoutSecs: 60,
        additionalMimeTypes: ['text/html'],
    });
    
    // Iniciar o crawler
    await crawler.run();
    
    console.log('Web scraping concluído com sucesso!');
    
    // 6. Sair do Actor
    await Actor.exit();
};

main().catch(console.error);
