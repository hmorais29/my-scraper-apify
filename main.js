// main.js - Versão Modularizada - CORRIGIDA
import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import locations from './locations.json' with { type: 'json' };

// Imports dos módulos (todos no root)
import { QueryExtractor } from './queryExtractor.js';
import { LocationMatcher } from './locationMatcher.js';
import { UrlBuilder } from './urlBuilder.js';
import { PropertyExtractor } from './propertyExtractor.js';

await Actor.init();

/**
 * Scraper principal do ImóVirtual - Versão Modularizada CORRIGIDA
 */
async function runScraper() {
    console.log('🚀 A iniciar scraper modularizado do ImóVirtual...');

    // 1. OBTER INPUT
    const input = await Actor.getInput();
    const query = input?.query || 'T3 com 87m2 apelação, Unhos por 165k';
    const maxResults = input?.max_resultados || 5;

    console.log(`🔍 Query: "${query}"`);
    console.log(`🎯 Máximo de resultados: ${maxResults}`);

    // 2. EXTRAIR PARÂMETROS DA QUERY
    const searchParams = QueryExtractor.extractAll(query);
    console.log('\n📋 Parâmetros extraídos:', searchParams);

    // 3. ENCONTRAR LOCALIZAÇÃO
    let bestLocation = null;
    let alternativeLocations = [];

    if (searchParams.locations && searchParams.locations.length > 0) {
        console.log('\n🔍 A procurar correspondência de localização...');
        
        bestLocation = LocationMatcher.findBestMatch(searchParams.locations, locations);
        
        if (!bestLocation) {
            console.log('⚠️ Nenhuma correspondência exacta. A procurar alternativas...');
            alternativeLocations = LocationMatcher.findAlternativeMatches(
                searchParams.locations, 
                locations, 
                2 // REDUZIDO de 3 para 2
            );
        }
    }

    // 4. CONSTRUIR URLs DE PESQUISA
    console.log('\n🔗 A construir URLs de pesquisa...');
    
    const searchUrlParams = {
        ...searchParams,
        location: bestLocation,
        // REMOVIDO: priceRange e area já não são usados para construir URL
    };

    const mainUrl = UrlBuilder.buildSearchUrl(searchUrlParams);
    const fallbackUrls = UrlBuilder.buildFallbackUrls(searchUrlParams);

    console.log(`🌐 URL principal: ${mainUrl}`);
    console.log(`🔄 ${fallbackUrls.length} URLs alternativas preparadas`);

    // 5. CONFIGURAR CRAWLER
    const results = [];
    let urlsTriedCount = 0;
    const maxUrlsToTry = 3;

    const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: maxUrlsToTry,
        requestHandlerTimeoutSecs: 30,
        
        async requestHandler({ $, response, request }) {
            urlsTriedCount++;
            console.log(`\n📄 A processar URL ${urlsTriedCount}/${maxUrlsToTry}: ${request.loadedUrl}`);

            if (response.statusCode !== 200) {
                console.log(`❌ Erro HTTP: ${response.statusCode}`);
                return;
            }

            console.log('✅ Página carregada com sucesso');

            // Seletor corrigido baseado no diagnóstico anterior
            const correctSelector = '[data-cy="search.listing.organic"] article';
            const listings = $(correctSelector);
            
            console.log(`📊 ${listings.length} anúncios encontrados`);
            
            if (listings.length === 0) {
                console.log('❌ Nenhum anúncio encontrado com o seletor principal');
                
                // Tentar seletores alternativos
                const alternativeSelectors = [
                    'article[data-cy*="listing"]',
                    '[data-testid*="listing"] article',
                    'article[class*="listing"]',
                    '.listing-item'
                ];

                for (const altSelector of alternativeSelectors) {
                    const altListings = $(altSelector);
                    if (altListings.length > 0) {
                        console.log(`✅ Encontrados ${altListings.length} anúncios com seletor alternativo: ${altSelector}`);
                        break;
                    }
                }
                return;
            }

            // 6. PROCESSAR ANÚNCIOS
            let validCount = 0;
            const listingArray = listings.toArray().slice(0, maxResults * 3); // Processar mais para compensar inválidos
            
            console.log(`🔄 A processar ${listingArray.length} anúncios...`);

            for (let i = 0; i < listingArray.length && validCount < maxResults; i++) {
                try {
                    const element = $(listingArray[i]);
                    const extractionResult = PropertyExtractor.processListingElement(
                        element, 
                        searchParams, 
                        results.length
                    );
                    
                    if (extractionResult.isValid) {
                        // Adicionar metadata da URL usada
                        extractionResult.property.searchUrl = request.loadedUrl;
                        extractionResult.property.urlIndex = urlsTriedCount;
                        
                        results.push(extractionResult.property);
                        validCount++;
                        
                        console.log(`✅ ${validCount}/${maxResults} - ADICIONADO: ${extractionResult.property.rooms} - ${extractionResult.property.areaFormatted} - ${extractionResult.property.priceFormatted}`);
                    } else {
                        console.log(`❌ REJEITADO:`, extractionResult.validations);
                    }
                    
                } catch (error) {
                    console.log(`⚠️ Erro ao processar anúncio ${i + 1}:`, error.message);
                }
            }

            console.log(`\n🎉 Resultados desta página: ${validCount} válidos de ${listingArray.length} processados`);
        },
        
        failedRequestHandler({ request, error }) {
            console.log(`❌ Falha na requisição ${request.url}: ${error.message}`);
        }
    });

    // 7. EXECUTAR SCRAPING - LÓGICA MELHORADA
    try {
        console.log('\n🚀 A iniciar scraping da URL principal...');
        await crawler.run([mainUrl]);

        console.log(`\n📊 RESULTADOS APÓS URL PRINCIPAL: ${results.length}/${maxResults}`);

        // CORRIGIDO: Só tentar alternativas se NÃO temos resultados suficientes E a localização foi bem identificada
        if (results.length < maxResults && bestLocation) {
            console.log(`\n🔄 Apenas ${results.length}/${maxResults} resultados com localização específica.`);
            console.log(`📍 Localização usada: ${bestLocation.name}`);
            
            // Só tentar 1 URL alternativa (sem tipologia) para a MESMA localização
            if (fallbackUrls.length > 0) {
                const firstFallback = fallbackUrls[0];
                console.log(`\n🔄 A tentar: ${firstFallback.description}`);
                await crawler.run([firstFallback.url]);
                console.log(`📊 Resultados após URL alternativa: ${results.length}/${maxResults}`);
            }
        }

        // APENAS se NÃO temos localização específica, tentar com localizações alternativas
        if (results.length === 0 && !bestLocation && alternativeLocations.length > 0) {
            console.log(`\n🔄 Sem localização principal. A tentar com localizações alternativas...`);
            
            for (const altLocation of alternativeLocations.slice(0, 1)) { // APENAS 1
                const altParams = { ...searchUrlParams, location: altLocation };
                const altUrl = UrlBuilder.buildSearchUrl(altParams);
                
                console.log(`🔄 A tentar localização: ${altLocation.name}`);
                await crawler.run([altUrl]);
                
                if (results.length > 0) {
                    console.log(`✅ Resultados obtidos com localização alternativa: ${altLocation.name}`);
                    break;
                }
            }
        }
        
    } catch (error) {
        console.log(`❌ Erro durante o scraping: ${error.message}`);
    }

    // 8. PROCESSAR RESULTADOS FINAIS
    console.log('\n📊 PROCESSAMENTO FINAL...');
    
    if (results.length > 0) {
        // Calcular estatísticas
        const stats = PropertyExtractor.calculateStats(results);
        
        // Adicionar estatísticas aos resultados
        const finalResults = results.map(result => ({
            ...result,
            stats: stats
        }));

        // Guardar resultados
        await Actor.pushData(finalResults);
        
        console.log(`\n🎉 SCRAPING CONCLUÍDO COM SUCESSO!`);
        console.log(`✅ ${results.length} imóveis encontrados e guardados`);
        console.log(`💰 Preço médio: ${stats.priceStats?.avg ? stats.priceStats.avg.toLocaleString() + '€' : 'N/A'}`);
        console.log(`📐 Área média: ${stats.areaStats?.avg ? stats.areaStats.avg + 'm²' : 'N/A'}`);
        console.log(`💎 Preço/m² médio: ${stats.pricePerSqmStats?.avg ? stats.pricePerSqmStats.avg.toLocaleString() + '€/m²' : 'N/A'}`);
        
    } else {
        console.log('\n❌ NENHUM RESULTADO ENCONTRADO');
        console.log('💡 Possíveis causas:');
        console.log('   - Localização muito específica');
        console.log('   - Filtros muito restritivos');
        console.log('   - Seletores da página mudaram');
        console.log('   - Sem resultados disponíveis para esta pesquisa');
        
        // Guardar dados de debug
        await Actor.pushData([{
            query: query,
            searchParams: searchParams,
            bestLocation: bestLocation,
            alternativeLocations: alternativeLocations,
            mainUrl: mainUrl,
            fallbackUrls: fallbackUrls.map(f => f.description),
            timestamp: new Date().toISOString(),
            status: 'NO_RESULTS'
        }]);
    }

    return results;
}

// 9. EXECUTAR E FINALIZAR
Actor.main(async () => {
    try {
        const results = await runScraper();
        
        console.log(`\n🏁 Scraper finalizado. Total: ${results.length} resultados`);
        
    } catch (error) {
        console.error('💥 Erro fatal no scraper:', error);
        
        // Guardar erro para debug
        await Actor.pushData([{
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            status: 'ERROR'
        }]);
        
        throw error;
        
    } finally {
        await Actor.exit();
    }
});
