const { Actor } = require('apify');
const { RequestQueue, PlaywrightCrawler, Dataset } = require('crawlee');

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
    
    // Usar a classe RequestQueue
    const requestQueue = await RequestQueue.open();
    await requestQueue.addRequest({ url: startUrl });
    
    // 3. Criar o PlaywrightCrawler (simula browser real)
    const crawler = new PlaywrightCrawler({
        requestQueue,
        maxRequestRetries: 2,
        maxConcurrency: 1,
        headless: true,
        
        // Configurações do browser para parecer mais humano
        launchContext: {
            launchOptions: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                ],
            },
        },
        
        requestHandler: async ({ request, page }) => {
            console.log(`Processando: ${request.url}`);
            
            // Adicionar delay inicial
            await page.waitForTimeout(2000);
            
            // Verificar se a página carregou
            try {
                await page.waitForSelector('body', { timeout: 10000 });
                console.log('Página carregada com sucesso');
            } catch (error) {
                console.log('Erro ao carregar página:', error.message);
                return;
            }
            
            // Obter título da página
            const pageTitle = await page.title();
            console.log(`Título da página: ${pageTitle}`);
            
            // Procurar por diferentes seletores de anúncios
            const possibleSelectors = [
                '.item-info-container',
                '.item',
                '.property-item',
                '[data-element-id]',
                '.ad-preview',
                'article'
            ];
            
            let itemsFound = false;
            let items = [];
            
            for (const selector of possibleSelectors) {
                try {
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        console.log(`Encontrados ${elements.length} elementos com seletor: ${selector}`);
                        itemsFound = true;
                        
                        // Extrair dados dos elementos encontrados
                        items = await page.evaluate((sel) => {
                            const elements = document.querySelectorAll(sel);
                            const results = [];
                            
                            elements.forEach((element, index) => {
                                if (index >= 20) return; // Limitar a 20 itens por página
                                
                                // Tentar extrair informações básicas
                                const titleEl = element.querySelector('h2 a, .item-link, .property-title, h3 a, a[title]');
                                const priceEl = element.querySelector('.item-price, .price, .property-price');
                                const locationEl = element.querySelector('.item-location, .location, .property-location');
                                
                                const title = titleEl ? titleEl.textContent.trim() : '';
                                const link = titleEl ? titleEl.href : '';
                                const price = priceEl ? priceEl.textContent.trim() : '';
                                const location = locationEl ? locationEl.textContent.trim() : '';
                                
                                // Tentar extrair mais detalhes
                                const detailsEls = element.querySelectorAll('.item-detail, .property-detail, .details span');
                                let rooms = '';
                                let size = '';
                                
                                if (detailsEls.length > 0) {
                                    rooms = detailsEls[0] ? detailsEls[0].textContent.trim() : '';
                                    size = detailsEls[1] ? detailsEls[1].textContent.trim() : '';
                                }
                                
                                if (title || price) {
                                    results.push({
                                        title,
                                        price,
                                        link,
                                        rooms,
                                        size,
                                        location,
                                        scrapedAt: new Date().toISOString(),
                                        sourceUrl: window.location.href
                                    });
                                }
                            });
                            
                            return results;
                        }, selector);
                        
                        break; // Sair do loop se encontrou elementos
                    }
                } catch (error) {
                    console.log(`Erro com seletor ${selector}:`, error.message);
                }
            }
            
            if (!itemsFound) {
                console.log('Nenhum anúncio encontrado. Verificando se há proteção anti-bot...');
                
                // Verificar se há elementos típicos de proteção anti-bot
                const bodyText = await page.evaluate(() => document.body.textContent.toLowerCase());
                if (bodyText.includes('cloudflare') || bodyText.includes('robot') || bodyText.includes('blocked')) {
                    console.log('Possível proteção anti-bot detectada');
                }
                
                // Fazer screenshot para debug (opcional)
                try {
                    await page.screenshot({ path: 'debug.png', fullPage: false });
                    console.log('Screenshot guardado como debug.png');
                } catch (screenshotError) {
                    console.log('Não foi possível fazer screenshot');
                }
                
                return;
            }
            
            console.log(`Encontrados ${items.length} imóveis nesta página`);
            
            // Guardar os dados
            if (items.length > 0) {
                await Dataset.pushData(items);
            }
            
            // Procurar próxima página (limitando a 2 páginas para teste)
            const currentPageCount = await requestQueue.getInfo();
            if (currentPageCount.totalRequestCount < 2) {
                try {
                    const nextPageUrl = await page.evaluate(() => {
                        const nextButton = document.querySelector('a.next-page, .icon-arrow-right-after, .pagination .next, [aria-label*="next"], [aria-label*="siguiente"]');
                        return nextButton ? nextButton.href : null;
                    });
                    
                    if (nextPageUrl) {
                        console.log(`Encontrada próxima página: ${nextPageUrl}`);
                        await requestQueue.addRequest({ url: nextPageUrl });
                    } else {
                        console.log('Não foi encontrada próxima página');
                    }
                } catch (error) {
                    console.log('Erro ao procurar próxima página:', error.message);
                }
            }
            
            // Delay antes de processar próxima página
            await page.waitForTimeout(3000);
        },
        
        failedRequestHandler: async ({ request, error }) => {
            console.log(`Request failed: ${request.url}`);
            console.log(`Error: ${error.message}`);
        },
    });
    
    // Iniciar o crawler
    await crawler.run();
    
    console.log('Web scraping concluído!');
    
    // 6. Sair do Actor
    await Actor.exit();
};

main().catch(console.error);
