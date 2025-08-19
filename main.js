const { Actor } = require('apify');
const { RequestQueue, PuppeteerCrawler, Dataset } = require('crawlee');

const main = async () => {
    // 1. Inicializar o ambiente do Actor
    await Actor.init();
    
    // 2. Obter a URL de entrada
    const input = await Actor.getInput();
    const startUrl = input.url || 'https://www.idealista.pt/comprar-casas/lisboa/';
    
    console.log(`Iniciando o web scraping para a URL: ${startUrl}`);
    
    // Usar a classe RequestQueue
    const requestQueue = await RequestQueue.open();
    await requestQueue.addRequest({ url: startUrl });
    
    // 3. Criar o PuppeteerCrawler (deve estar disponível)
    const crawler = new PuppeteerCrawler({
        requestQueue,
        maxRequestRetries: 2,
        maxConcurrency: 1,
        headless: true,
        
        // Configurações do browser
        launchContext: {
            launchOptions: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                ],
            },
        },
        
        requestHandler: async ({ request, page }) => {
            console.log(`Processando: ${request.url}`);
            
            // Configurar user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Adicionar headers extra
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            });
            
            // Aguardar carregamento
            try {
                await page.waitForSelector('body', { timeout: 15000 });
                console.log('Página carregada');
                
                // Aguardar um pouco mais para JavaScript carregar
                await page.waitForTimeout(3000);
                
            } catch (error) {
                console.log('Erro ao carregar página:', error.message);
                return;
            }
            
            // Verificar título
            const pageTitle = await page.title();
            console.log(`Título da página: ${pageTitle}`);
            
            // Verificar se estamos bloqueados
            const pageContent = await page.content();
            if (pageContent.includes('403') || pageContent.includes('blocked') || pageContent.includes('robot')) {
                console.log('Página parece estar bloqueada. Conteúdo:', pageContent.substring(0, 500));
                return;
            }
            
            // Procurar anúncios com diferentes seletores
            const items = await page.evaluate(() => {
                const possibleSelectors = [
                    '.item-info-container',
                    '.item',
                    '.property-item', 
                    'article',
                    '[data-element-id]',
                    '.ad-preview'
                ];
                
                let foundElements = [];
                
                for (const selector of possibleSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        console.log(`Seletor ${selector}: ${elements.length} elementos`);
                        
                        elements.forEach((element, index) => {
                            if (index >= 15) return; // Limitar resultados
                            
                            // Extrair dados básicos
                            const titleEl = element.querySelector('h2 a, .item-link, h3 a, a[title]');
                            const priceEl = element.querySelector('.item-price, .price');
                            const locationEl = element.querySelector('.item-location, .location');
                            
                            let title = '';
                            let link = '';
                            let price = '';
                            let location = '';
                            
                            if (titleEl) {
                                title = titleEl.textContent?.trim() || '';
                                link = titleEl.href || '';
                                if (link && !link.startsWith('http')) {
                                    link = 'https://www.idealista.pt' + link;
                                }
                            }
                            
                            if (priceEl) {
                                price = priceEl.textContent?.trim() || '';
                            }
                            
                            if (locationEl) {
                                location = locationEl.textContent?.trim() || '';
                            }
                            
                            // Extrair detalhes adicionais
                            const detailElements = element.querySelectorAll('.item-detail, .detail');
                            let rooms = '';
                            let size = '';
                            
                            if (detailElements.length > 0) {
                                rooms = detailElements[0]?.textContent?.trim() || '';
                            }
                            if (detailElements.length > 1) {
                                size = detailElements[1]?.textContent?.trim() || '';
                            }
                            
                            // Só adicionar se tem pelo menos título ou preço
                            if (title || price) {
                                foundElements.push({
                                    title,
                                    price,
                                    link,
                                    rooms,
                                    size,
                                    location,
                                    selector: selector,
                                    scrapedAt: new Date().toISOString()
                                });
                            }
                        });
                        
                        if (foundElements.length > 0) break; // Parar se encontrou dados
                    }
                }
                
                // Se não encontrou nada, mostrar estrutura da página
                if (foundElements.length === 0) {
                    const allElements = document.querySelectorAll('*');
                    const elementTypes = {};
                    
                    Array.from(allElements).forEach(el => {
                        const tagClass = el.className ? `${el.tagName}.${el.className}` : el.tagName;
                        elementTypes[tagClass] = (elementTypes[tagClass] || 0) + 1;
                    });
                    
                    console.log('Elementos encontrados na página:', Object.keys(elementTypes).slice(0, 20));
                }
                
                return foundElements;
            });
            
            console.log(`Encontrados ${items.length} imóveis`);
            
            // Guardar dados
            if (items.length > 0) {
                await Dataset.pushData(items);
                console.log('Dados guardados!');
            } else {
                console.log('Nenhum dado encontrado. Fazendo screenshot para debug...');
                try {
                    await page.screenshot({ path: 'debug.png', fullPage: false });
                } catch (e) {
                    console.log('Não foi possível fazer screenshot');
                }
            }
            
            // Procurar próxima página (apenas 1 página para teste inicial)
            const queueInfo = await requestQueue.getInfo();
            if (queueInfo.totalRequestCount < 2 && items.length > 0) {
                const nextUrl = await page.evaluate(() => {
                    const nextBtn = document.querySelector('a.next-page, .pagination .next, [aria-label*="next"]');
                    return nextBtn ? nextBtn.href : null;
                });
                
                if (nextUrl) {
                    console.log(`Próxima página: ${nextUrl}`);
                    await requestQueue.addRequest({ url: nextUrl });
                }
            }
            
            // Delay
            await page.waitForTimeout(2000);
        },
        
        failedRequestHandler: async ({ request, error }) => {
            console.log(`Request failed: ${request.url} - ${error.message}`);
        },
    });
    
    // Iniciar crawler
    await crawler.run();
    
    console.log('Scraping concluído!');
    await Actor.exit();
};

main().catch(console.error);
