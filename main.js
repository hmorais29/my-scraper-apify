// main.js - Versão com sistema de location matching corrigido
import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import locations from './locations.json' with { type: 'json' };

// Imports dos módulos (todos no root) - USAR OS CORRIGIDOS
import { QueryExtractor } from './queryExtractor.js';      // ✅ CORRIGIDO
import { LocationMatcher } from './locationMatcher.js';    // ✅ CORRIGIDO
import { UrlBuilder } from './urlBuilder.js';
import { PropertyExtractor } from './propertyExtractor.js';

await Actor.init();

/**
 * Scraper principal do ImóVirtual - Com correções de location matching
 */
async function runScraper() {
    console.log('🚀 A iniciar scraper modularizado do ImóVirtual...');

    // 1. OBTER INPUT
    const input = await Actor.getInput();
    const query = input?.query || 'T3 com 87m2 apelação, Unhos por 165k';
    const maxResults = input?.max_resultados || 5;

    console.log(`🔍 Query: "${query}"`);
    console.log(`🎯 Máximo de resultados: ${maxResults}`);

    // 2. EXTRAIR PARÂMETROS DA QUERY (VERSÃO CORRIGIDA)
    const searchParams = QueryExtractor.extractAll(query);
    console.log('\n📋 Parâmetros extraídos:', searchParams);

    // 3. ENCONTRAR LOCALIZAÇÃO (VERSÃO CORRIGIDA)
    let bestLocation = null;
    let alternativeLocations = [];

    if (searchParams.locations && searchParams.locations.length > 0) {
        console.log('\n🔍 A procurar correspondência de localização...');
        
        // USAR O SISTEMA CORRIGIDO
        bestLocation = LocationMatcher.findBestMatch(searchParams.locations, locations);
        
        if (bestLocation) {
            console.log(`✅ LOCALIZAÇÃO ENCONTRADA: ${bestLocation.name} (${bestLocation.level})`);
            console.log(`🆔 ID: ${bestLocation.id}`);
            console.log(`🌐 URL terá: /${bestLocation.id}`);
            
            // VALIDAÇÃO EXTRA: Verificar se é o resultado esperado
            const queryText = searchParams.locations.join(' ').toLowerCase();
            const locationName = bestLocation.name.toLowerCase();
            const isGoodMatch = queryText.includes(locationName.split(' ')[0]) || 
                               locationName.includes(queryText.split(' ')[0]);
            
            console.log(`${isGoodMatch ? '✅' : '⚠️'} Match quality: ${isGoodMatch ? 'BOM' : 'VERIFICAR'}`);
            
        } else {
            console.log('⚠️ Nenhuma correspondência exacta. A procurar alternativas...');
            alternativeLocations = LocationMatcher.findAlternativeMatches(
                searchParams.locations, 
                locations, 
                3
            );
            
            if (alternativeLocations.length > 0) {
                console.log('🔄 Alternativas encontradas:');
                alternativeLocations.forEach((alt, i) => {
                    console.log(`  ${i + 1}. ${alt.name} (${alt.level})`);
                });
            }
        }
        
        // OPÇÃO DE DEBUG: Descomentar para ver detalhes do matching
        /*
        if (searchParams.locations.length > 0) {
            console.log('\n🐛 DEBUG - Detalhes do matching:');
            LocationMatcher.debugLocationMatch(
                searchParams.locations[0],
                bestLocation?.name || 'N/A',
                locations
            );
        }
        */
    }

    // 4. CONSTRUIR URLs DE PESQUISA (código original mantido)
    console.log('\n🔗 A construir URLs de pesquisa...');
    
    const searchUrlParams = {
        ...searchParams,
        location: bestLocation,
        // Converter preço extraído para range se existir
        priceRange: searchParams.priceRange ? searchParams.priceRange : null,
        // Converter área extraída para range se existir
        area: searchParams.area ? { min: searchParams.area - 10, max: searchParams.area + 10 } : null
    };

    const mainUrl = UrlBuilder.buildSearchUrl(searchUrlParams);
    const fallbackUrls = UrlBuilder.buildFallbackUrls(searchUrlParams);

    console.log(`🌐 URL principal: ${mainUrl}`);
    console.log(`🔄 ${fallbackUrls.length} URLs alternativas preparadas`);

    // VALIDAÇÃO DA URL CONSTRUÍDA
    if (bestLocation) {
        const urlContainsLocation = mainUrl.includes(bestLocation.id);
        console.log(`${urlContainsLocation ? '✅' : '❌'} URL ${urlContainsLocation ? 'contém' : 'NÃO contém'} o ID da localização`);
    }

    // 5. CONFIGURAR CRAWLER (código original mantido)
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

            // 6. PROCESSAR ANÚNCIOS (código original mantido)
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
                        extractionResult.property.locationUsed = bestLocation; // NOVO: Info da localização
                        
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

    // 7. EXECUTAR SCRAPING (código original mantido)
    const urlsToTry = [mainUrl];
    
    try {
        console.log('\n🚀 A iniciar scraping da URL principal...');
        await crawler.run([mainUrl]);

        // Se não obtivemos resultados suficientes, tentar URLs alternativas
        if (results.length < maxResults && fallbackUrls.length > 0) {
            console.log(`\n🔄 Apenas ${results.length}/${maxResults} resultados. A tentar URLs alternativas...`);
            
            for (const fallback of fallbackUrls.slice(0, 2)) { // Máximo 2 URLs alternativas
                if (results.length >= maxResults) break;
                
                console.log(`\n🔄 A tentar: ${fallback.description}`);
                await crawler.run([fallback.url]);
                
                if (results.length > 0) {
                    console.log(`✅ ${results.length} resultados obtidos com URL alternativa`);
                    break;
                }
            }
        }

        // Se ainda não temos resultados, tentar com localizações alternativas (MELHORADO)
        if (results.length === 0 && alternativeLocations.length > 0) {
            console.log(`\n🔄 A tentar com localizações alternativas...`);
            
            for (const altLocation of alternativeLocations.slice(0, 2)) {
                const altParams = { ...searchUrlParams, location: altLocation };
                const altUrl = UrlBuilder.buildSearchUrl(altParams);
                
                console.log(`🔄 A tentar localização: ${altLocation.name} (${altLocation.level})`);
                console.log(`🌐 URL: ${altUrl}`);
                
                await crawler.run([altUrl]);
                
                if (results.length > 0) {
                    console.log(`✅ Resultados obtidos com localização alternativa: ${altLocation.name}`);
                    // Adicionar info sobre qual localização alternativa foi usada
                    results.forEach(result => {
                        result.alternativeLocationUsed = altLocation;
                    });
                    break;
                }
            }
        }
        
    } catch (error) {
        console.log(`❌ Erro durante o scraping: ${error.message}`);
    }

    // 8. PROCESSAR RESULTADOS FINAIS (código original + melhorias)
    console.log('\n📊 PROCESSAMENTO FINAL...');
    
    if (results.length > 0) {
        // Calcular estatísticas
        const stats = PropertyExtractor.calculateStats(results);
        
        // Adicionar estatísticas e info de localização aos resultados
        const finalResults = results.map(result => ({
            ...result,
            stats: stats,
            searchInfo: {
                originalQuery: query,
                bestLocationFound: bestLocation,
                locationMatchingWorked: !!bestLocation,
                extractedLocations: searchParams.locations
            }
        }));

        // Guardar resultados
        await Actor.pushData(finalResults);
        
        console.log(`\n🎉 SCRAPING CONCLUÍDO COM SUCESSO!`);
        console.log(`✅ ${results.length} imóveis encontrados e guardados`);
        
        // INFO SOBRE LOCALIZAÇÃO
        if (bestLocation) {
            console.log(`📍 Localização usada: ${bestLocation.name} (${bestLocation.level})`);
            console.log(`🆔 ID da localização: ${bestLocation.id}`);
        }
        
        console.log(`💰 Preço médio: ${stats.priceStats?.avg ? stats.priceStats.avg.toLocaleString() + '€' : 'N/A'}`);
        console.log(`📐 Área média: ${stats.areaStats?.avg ? stats.areaStats.avg + 'm²' : 'N/A'}`);
        console.log(`💎 Preço/m² médio: ${stats.pricePerSqmStats?.avg ? stats.pricePerSqmStats.avg.toLocaleString() + '€/m²' : 'N/A'}`);
        
    } else {
        console.log('\n❌ NENHUM RESULTADO ENCONTRADO');
        console.log('💡 Possíveis causas:');
        console.log('   - Localização muito específica ou não encontrada');
        console.log('   - Filtros muito restritivos');
        console.log('   - Seletores da página mudaram');
        console.log('   - Sem resultados disponíveis para esta pesquisa');
        
        // Info extra sobre location matching para debug
        if (searchParams.locations && searchParams.locations.length > 0) {
            console.log('\n🔍 DIAGNÓSTICO DE LOCALIZAÇÃO:');
            console.log(`   - Localizações extraídas: [${searchParams.locations.join(', ')}]`);
            console.log(`   - Melhor match encontrado: ${bestLocation ? bestLocation.name : 'NENHUM'}`);
            console.log(`   - Alternativas disponíveis: ${alternativeLocations.length}`);
        }
        
        // Guardar dados de debug (MELHORADO)
        await Actor.pushData([{
            query: query,
            searchParams: searchParams,
            bestLocation: bestLocation,
            alternativeLocations: alternativeLocations,
            mainUrl: mainUrl,
            fallbackUrls: fallbackUrls.map(f => f.description),
            locationMatchingResults: {
                extractedLocations: searchParams.locations,
                bestMatchFound: !!bestLocation,
                bestMatchName: bestLocation?.name,
                bestMatchLevel: bestLocation?.level,
                alternativesCount: alternativeLocations.length
            },
            timestamp: new Date().toISOString(),
            status: 'NO_RESULTS'
        }]);
    }

    return results;
}

// 9. EXECUTAR E FINALIZAR (código original mantido)
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

// FUNÇÃO EXTRA PARA DEBUG (opcional)
// Descomentar se quiseres testar location matching separadamente
/*
async function testLocationMatching() {
    const testQueries = [
        "Santo António dos Cavaleiros",
        "apartamento T3 Santo António dos Cavaleiros",
        "T2 arrendamento Loures",
        "casa Apelação"
    ];
    
    console.log('\n🧪 === TESTE DE LOCATION MATCHING ===');
    
    for (const query of testQueries) {
        console.log(`\n🔍 Teste: "${query}"`);
        const extracted = QueryExtractor.extractAll(query);
        const match = LocationMatcher.findBestMatch(extracted.locations, locations);
        
        console.log(`📍 Extraído: [${extracted.locations.join(', ')}]`);
        console.log(`🎯 Match: ${match ? `${match.name} (${match.level})` : 'NENHUM'}`);
        
        if (match) {
            console.log(`🆔 ID: ${match.id}`);
            console.log(`🌐 URL: https://www.imovirtual.com/pt/resultados/comprar/apartamento/${match.id}`);
        }
    }
}
*/
