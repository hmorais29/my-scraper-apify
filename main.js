import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

// URL de teste (um que sabemos que funciona)
const testUrl = 'https://www.imovirtual.com/pt/resultados/comprar/apartamento,t3/lisboa/loures/santo-antonio-dos-cavaleiros-e-frielas/santo-antonio-dos-cavaleiros?limit=36&ownerTypeSingleSelect=ALL&by=DEFAULT&direction=DESC&search%5Bfilter_enum_builttype%5D=1';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 30,
    
    async requestHandler({ $, response, request }) {
        console.log('🔍 DIAGNÓSTICO DA PÁGINA');
        console.log('========================');
        console.log(`Status: ${response.statusCode}`);
        console.log(`URL: ${request.loadedUrl}`);
        console.log(`Content-Type: ${response.headers['content-type']}`);
        
        // Verificar tamanho da página
        const bodyText = $('body').text();
        console.log(`📄 Tamanho do conteúdo: ${bodyText.length} caracteres`);
        
        // Procurar por diferentes seletores de anúncios
        const selectors = [
            'article[data-cy="listing-item"]',
            'div[data-cy="search.listing.organic"]',
            'article[data-testid="listing-item"]',
            'article',
            '.offer-item',
            '.listing-item',
            '[data-cy*="listing"]',
            '[data-testid*="listing"]'
        ];
        
        console.log('\n🔍 TESTE DE SELETORES:');
        selectors.forEach(selector => {
            const elements = $(selector);
            console.log(`  ${selector}: ${elements.length} elementos`);
        });
        
        // Procurar por texto que indica anúncios
        const hasPrecos = bodyText.includes('€');
        const hasT1T2T3 = /T[0-9]/.test(bodyText);
        const hasArrendamento = bodyText.includes('arrendamento') || bodyText.includes('venda');
        
        console.log('\n📊 INDICADORES DE ANÚNCIOS:');
        console.log(`  Tem preços (€): ${hasPrecos}`);
        console.log(`  Tem tipologias (T1, T2...): ${hasT1T2T3}`);
        console.log(`  Tem palavras-chave imobiliárias: ${hasArrendamento}`);
        
        // Extrair uma amostra do HTML para análise
        const htmlSample = $('body').html().substring(0, 2000);
        console.log('\n🔍 AMOSTRA HTML (primeiros 2000 chars):');
        console.log(htmlSample);
        
        // Procurar por padrões comuns de estrutura de anúncios
        const commonPatterns = [
            'listing',
            'property',
            'offer',
            'anuncio',
            'item'
        ];
        
        console.log('\n🎯 ANÁLISE DE PADRÕES:');
        commonPatterns.forEach(pattern => {
            const count = (htmlSample.match(new RegExp(pattern, 'gi')) || []).length;
            console.log(`  "${pattern}": ${count} ocorrências`);
        });
        
        // Verificar se há JavaScript que pode estar a carregar conteúdo
        const scripts = $('script');
        console.log(`\n⚙️ SCRIPTS ENCONTRADOS: ${scripts.length}`);
        
        // Procurar por indicações de carregamento dinâmico
        const hasLoading = bodyText.includes('loading') || bodyText.includes('carregando');
        const hasNoResults = bodyText.includes('sem resultados') || bodyText.includes('no results');
        
        console.log(`  Tem indicadores de loading: ${hasLoading}`);
        console.log(`  Tem "sem resultados": ${hasNoResults}`);
        
        await Actor.pushData({
            type: 'DEBUG_ANALYSIS',
            url: request.loadedUrl,
            statusCode: response.statusCode,
            contentLength: bodyText.length,
            selectorResults: selectors.map(sel => ({
                selector: sel,
                count: $(sel).length
            })),
            indicators: {
                hasPrecos,
                hasT1T2T3,
                hasArrendamento,
                hasLoading,
                hasNoResults
            },
            htmlSample: htmlSample
        });
    }
});

await crawler.run([testUrl]);
await Actor.exit();
