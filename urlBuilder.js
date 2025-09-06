// urlBuilder.js

/**
 * Constrói URLs do ImóVirtual com base nos parâmetros de pesquisa
 */
export class UrlBuilder {

    /**
     * Constrói URL principal do ImóVirtual
     * CORRIGIDO: Não usa priceRange NEM area para filtrar a pesquisa
     */
    static buildSearchUrl(searchParams) {
        const { 
            searchType, 
            rooms, 
            location, 
            condition, 
            propertyType = 'apartamento' 
        } = searchParams;

        console.log('🔗 A construir URL com parâmetros:', searchParams);

        // Base URL
        let baseUrl = 'https://www.imovirtual.com/pt/resultados/';
        baseUrl += searchType === 'rent' ? 'arrendar/' : 'comprar/';
        baseUrl += propertyType;

        // Adicionar tipologia se especificada
        if (rooms) {
            const roomNum = rooms.replace('T', '').toLowerCase();
            baseUrl += `,t${roomNum}`;
        }

        // Adicionar localização se encontrada
        if (location && location.id) {
            baseUrl += `/${location.id}`;
            console.log(`📍 Localização adicionada: ${location.name} (${location.id})`);
        }

        // Parâmetros de query
        const params = new URLSearchParams();
        params.set('limit', '36');
        params.set('ownerTypeSingleSelect', 'ALL');
        params.set('by', 'DEFAULT');
        params.set('direction', 'DESC');

        // Adicionar condição do imóvel
        if (condition) {
            switch (condition) {
                case 'new':
                    params.set('search[filter_enum_builttype]', '0');
                    console.log('🏗️ Filtro: Imóveis novos');
                    break;
                case 'used':
                    params.set('search[filter_enum_builttype]', '1');
                    console.log('🏠 Filtro: Imóveis usados');
                    break;
                case 'renovated':
                    params.set('search[filter_enum_builttype]', '2');
                    console.log('🔨 Filtro: Imóveis renovados');
                    break;
            }
        }

        // CORRIGIDO: NÃO adicionar filtro de preço (apenas usar para comparação posterior)
        console.log('⚠️  Filtro de preço REMOVIDO - pesquisa sem limitação de preço');

        // CORRIGIDO: NÃO adicionar filtro de área (apenas usar para comparação posterior)
        console.log('⚠️  Filtro de área REMOVIDO - pesquisa sem limitação de área');

        const finalUrl = baseUrl + '?' + params.toString();
        console.log(`🌐 URL construída: ${finalUrl}`);

        return finalUrl;
    }

    /**
     * Constrói URLs alternativas se a principal não der resultados
     * CORRIGIDO: Reduzido o número de alternativas para não interferir
     */
    static buildFallbackUrls(searchParams) {
        console.log('🔄 A gerar URLs alternativas (REDUZIDAS)...');

        const fallbackUrls = [];
        const baseParams = { ...searchParams };

        // APENAS 1 alternativa: Remover tipologia se existir
        if (baseParams.rooms) {
            const noRoomsParams = { ...baseParams };
            delete noRoomsParams.rooms;
            fallbackUrls.push({
                url: this.buildSearchUrl(noRoomsParams),
                description: 'Pesquisa sem filtro de tipologia (mesma localização)'
            });
            console.log('📝 Adicionada 1 alternativa: sem filtro de tipologia');
        }

        // Se não tem tipologia, adicionar alternativa sem localização
        else if (baseParams.location) {
            const noLocationParams = { ...baseParams };
            delete noLocationParams.location;
            fallbackUrls.push({
                url: this.buildSearchUrl(noLocationParams),
                description: 'Pesquisa sem filtro de localização'
            });
            console.log('📝 Adicionada 1 alternativa: sem filtro de localização');
        }

        console.log(`🔄 ${fallbackUrls.length} URLs alternativas geradas (REDUZIDAS para evitar interferência)`);
        return fallbackUrls;
    }

    /**
     * Valida se uma URL está bem formada
     */
    static validateUrl(url) {
        try {
            const urlObj = new URL(url);
            const isImovirtual = urlObj.hostname.includes('imovirtual.com');
            const hasSearchPath = urlObj.pathname.includes('/resultados/');
            
            const isValid = isImovirtual && hasSearchPath;
            console.log(`🔍 URL ${isValid ? 'válida' : 'inválida'}: ${url.substring(0, 100)}...`);
            
            return isValid;
        } catch (error) {
            console.log(`❌ Erro na validação da URL: ${error.message}`);
            return false;
        }
    }
}
