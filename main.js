const { Actor } = require('apify');
const { RequestQueue, CheerioCrawler, Dataset } = require('crawlee');

const main = async () => {
    // 1. Inicializar o ambiente do Actor
    await Actor.init();
    
    // 2. Obter a URL de entrada
    const input = await Actor.getInput();
    
    // Para testar, vamos usar um site mais simples primeiro
    const testUrl = 'https://httpbin.org/html';
    const idealistaUrl = input.url || 'https://www.idealista.pt/comprar-casas/lisboa/';
    
    console.log('=== TESTE INICIAL ===');
    console.log(`Testando primeiro com: ${testUrl}`);
    
    // Usar a classe RequestQueue
    const requestQueue = await RequestQueue.open();
    
    // Adicionar URL de teste primeiro
    await requestQueue.addRequest({ 
        url: testUrl,
        userData: { type: 'test' }
    });
    
    // 3. Criar o CheerioCrawler básico para teste
    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 1,
        maxConcurrency: 1,
        
        requestHandler: async ({ request, $, response }) => {
            console.log(`\n--- Processando: ${request.url} ---`);
            console.log(`Status: ${response.statusCode}`);
            console.log(`Content-Type: ${response.headers['content-type']}`);
            
            if (request.userData?.type === 'test') {
                console.log('=== TESTE DE CONECTIVIDADE ===');
                const title = $('title').text();
                const h1 = $('h1').text();
                console.log(`Título: ${title}`);
                console.log(`H1: ${h1}`);
                
                if (response.statusCode === 200) {
                    console.log('✅ Teste básico passou! O crawler está funcional.');
                    console.log('Agora vamos tentar o Idealista...\n');
                    
                    // Adicionar URL do Idealista após teste bem-sucedido
                    await requestQueue.addRequest({ 
                        url: idealistaUrl,
                        userData: { type: 'idealista' },
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'DNT': '1',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1',
                            'Referer': 'https://www.google.pt/',
                        }
                    });
                } else {
                    console.log('❌ Teste básico falhou');
                }
                return;
            }
            
            // Processar Idealista
            if (request.userData?.type === 'idealista') {
                console.log('=== TENTATIVA IDEALISTA ===');
                
                if (response.statusCode !== 200) {
                    console.log(`❌ Status: ${response.statusCode} - Bloqueado`);
                    
                    // Mostrar headers da resposta para debug
                    console.log('Headers da resposta:');
                    Object.entries(response.headers).forEach(([key, value]) => {
                        console.log(`  ${key}: ${value}`);
                    });
                    
                    return;
                }
                
                console.log('✅ Conseguimos aceder ao Idealista!');
                
                const pageTitle = $('title').text();
                console.log(`Título da página: ${pageTitle}`);
                
                // Analisar estrutura da página
                console.log('\n=== ANÁLISE DA ESTRUTURA ===');
                const bodyClasses = $('body').attr('class');
                console.log(`Classes do body: ${bodyClasses}`);
                
                // Procurar por elementos comuns de imóveis
                const commonSelectors = [
                    '.item-info-container',
                    '.item',
                    '.property-item',
                    'article',
                    '[data-element-id]',
                    '.ad-preview',
                    '.property',
                    '.listing',
                    '.real-estate-item'
                ];
                
                let foundElements = false;
                const allResults = [];
                
                for (const selector of commonSelectors) {
                    const elements = $(selector);
                    if (elements.length > 0) {
                        console.log(`✅ Encontrados ${elements.length} elementos com: ${selector}`);
                        foundElements = true;
                        
                        // Extrair dados dos primeiros 10 elementos
                        elements.slice(0, 10).each((i, el) => {
                            const item = $(el);
                            
                            // Tentar diferentes formas de extrair título e link
                            const titleSelectors = ['h2 a', '.item-link', 'h3 a', 'a[title]', '.title a', '.property-title'];
                            const priceSelectors = ['.item-price', '.price', '.property-price', '.cost'];
                            const locationSelectors = ['.item-location', '.location', '.property-location', '.address'];
                            
                            let title = '', link = '', price = '', location = '';
                            
                            // Procurar título e link
                            for (const titleSel of titleSelectors) {
                                const titleEl = item.find(titleSel);
                                if (titleEl.length > 0) {
                                    title = titleEl.text().trim();
                                    link = titleEl.attr('href') || '';
                                    if (link && !link.startsWith('http')) {
                                        link = 'https://www.idealista.pt' + link;
                                    }
                                    break;
                                }
                            }
                            
                            // Procurar preço
                            for (const priceSel of priceSelectors) {
                                const priceEl = item.find(priceSel);
                                if (priceEl.length > 0) {
                                    price = priceEl.text().trim();
                                    break;
                                }
                            }
                            
                            // Procurar localização
                            for (const locSel of locationSelectors) {
                                const locEl = item.find(locSel);
                                if (locEl.length > 0) {
                                    location = locEl.text().trim();
                                    break;
                                }
                            }
                            
                            if (title || price) {
                                allResults.push({
                                    title: title || 'N/A',
                                    price: price || 'N/A',
                                    link: link || 'N/A',
                                    location: location || 'N/A',
                                    selector: selector,
                                    scrapedAt: new Date().toISOString(),
                                    sourceUrl: request.url
                                });
                            }
                        });
                        
                        break; // Parar após encontrar elementos válidos
                    }
                }
                
                if (!foundElements) {
                    console.log('❌ Nenhum elemento de imóvel encontrado');
                    console.log('\nElementos disponíveis na página (primeiros 20):');
                    
                    // Mostrar elementos disponíveis para debug
                    const uniqueElements = new Set();
                    $('*').each((i, el) => {
                        if (uniqueElements.size >= 20) return;
                        const tagClass = el.tagName + ($(el).attr('class') ? '.' + $(el).attr('class').split(' ')[0] : '');
                        uniqueElements.add(tagClass);
                    });
                    
                    Array.from(uniqueElements).forEach(elem => console.log(`  ${elem}`));
                } else {
                    console.log(`\n✅ Extraídos ${allResults.length} imóveis!`);
                    
                    // Mostrar primeiros resultados para verificação
                    allResults.slice(0, 3).forEach((item, i) => {
                        console.log(`\nImóvel ${i + 1}:`);
                        console.log(`  Título: ${item.title.substring(0, 50)}...`);
                        console.log(`  Preço: ${item.price}`);
                        console.log(`  Localização: ${item.location}`);
                    });
                    
                    // Guardar dados
                    await Dataset.pushData(allResults);
                }
            }
        },
        
        failedRequestHandler: async ({ request, error }) => {
            console.log(`\n❌ Request falhou: ${request.url}`);
            console.log(`Erro: ${error.message}`);
        },
    });
    
    // Iniciar crawler
    await crawler.run();
    
    console.log('\n=== SCRAPING CONCLUÍDO ===');
    await Actor.exit();
};

main().catch(console.error);
