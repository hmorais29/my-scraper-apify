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
    
    // 3. Criar o CheerioCrawler com configurações anti-detecção
    const crawler = new CheerioCrawler({
        requestQueue,
        // Configurações para evitar detecção
        maxRequestRetries: 3,
        requestHandlerTimeoutMillis: 60000,
        maxRequestsPerMinute: 30, // Limitar velocidade
        sessionPoolOptions: {
            maxPoolSize: 10,
            sessionOptions: {
                maxUsageCount: 50,
            },
        },
        // Configurar headers personalizados
        preNavigationHooks: [
            async ({ request, session }) => {
                request.headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0',
                    'Referer': 'https://www.google.com/',
                };
            },
        ],
        // Define a lógica para cada página que o crawler visita
        requestHandler: async ({ request, $ }) => {
            const pageTitle = $('title').text();
            console.log(`Processando a página: ${pageTitle}`);
            
            // Verificar se chegámos à página correta
            if (!$('.item-info-container').length) {
                console.log('Não foram encontrados anúncios. Página pode ter mudado ou está bloqueada.');
                console.log('HTML snippet:', $.html().substring(0, 500));
                return;
            }
            
            // Encontra todos os anúncios de imóveis na página
            const properties = [];
            $('.item-info-container').each((i, el) => {
                const item = $(el);
                
                // 4. Extrair os dados de cada anúncio
                const title = item.find('h2 a').text().trim();
                const link = 'https://www.idealista.pt' + item.find('h2 a').attr('href');
                const price = item.find('.item-price').text().trim();
                const rooms = item.find('.item-detail').eq(0).text().trim();
                const size = item.find('.item-detail').eq(1).text().trim();
                const location = item.find('.item-location').text().trim();
                
                if (title) { // Só adicionar se encontrou dados
                    properties.push({
                        title,
                        price,
                        link,
                        rooms,
                        size,
                        location,
                        scrapedAt: new Date().toISOString()
                    });
                }
            });
            
            console.log(`Encontrados ${properties.length} imóveis nesta página`);
            
            // Guardar os dados
            if (properties.length > 0) {
                await Dataset.pushData(properties);
            }
            
            // Adicionar delay entre páginas
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
            
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
