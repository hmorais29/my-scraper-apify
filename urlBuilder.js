// urlBuilder.js

/**
 * Constrói URLs do ImóVirtual com base nos parâmetros de pesquisa
 */
export class UrlBuilder {

    /**
     * Constrói URL principal do ImóVirtual
     */
    static buildSearchUrl(searchParams) {
        const { 
            searchType, 
            rooms, 
            location, 
            condition, 
            priceRange, 
            area,
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

        // Adicionar filtro de preço
        if (priceRange) {
            if (priceRange.min) {
                params.set('search[filter_float_price:from]', priceRange.min.toString());
                console.log(`💰 Preço mínimo: ${priceRange.min.toLocaleString()}€`);
            }
            if (priceRange.max) {
                params.set('search[filter_float_price:to]', priceRange.max.toString());
                console.log(`💰 Preço máximo: ${priceRange.max.toLocaleString()}€`);
            }
        }

        // Adicionar filtro de área
        if (area) {
            if (area.min) {
                params.set('search[filter_float_m:from]', area.min.toString());
                console.log(`📐 Área mínima: ${area.min}m²`);
            }
            if (area.max) {
                params.set('search[filter_float_m:to]', area.max.toString());
                console.log(`📐 Área máxima: ${area.max}m²`);
            }
        }

        const finalUrl = baseUrl + '?' + params.toString();
        console.log(`🌐 URL construída: ${finalUrl}`);

        return finalUrl;
    }

    /**
     * Constrói URLs alternativas se a principal não der resultados
     */
    static buildFallbackUrls(searchParams) {
        console.log('🔄 A gerar URLs alternativas...');

        const fallbackUrls = [];
        const baseParams = { ...searchParams };

        // 1. Remover localização específica (pesquisa mais ampla)
        if (baseParams.location) {
            const genericParams = { ...baseParams };
            
            // Se é neighborhood/parish, tentar council/district
            if (baseParams.location.type === 'neighborhood' || baseParams.location.type === 'parish') {
                const parents = baseParams.location.parents || [];
                const council = parents.find(p => p.detailedLevel === 'council');
                const district = parents.find(p => p.detailedLevel === 'district');
                
                if (council) {
                    genericParams.location = {
                        id: council.id,
                        name: council.name,
                        type: 'council'
                    };
                    fallbackUrls.push({
                        url: this.buildSearchUrl(genericParams),
                        description: `Pesquisa no concelho: ${council.name}`
                    });
                }
                
                if (district) {
                    genericParams.location = {
                        id: district.id,
                        name: district.name,
                        type: 'district'
                    };
                    fallbackUrls.push({
                        url: this.buildSearchUrl(genericParams),
                        description: `Pesquisa no distrito: ${district.name}`
                    });
                }
            }

            // Sem localização específica
            delete genericParams.location;
            fallbackUrls.push({
                url: this.buildSearchUrl(genericParams),
                description: 'Pesquisa sem filtro de localização'
            });
        }

        // 2. Flexibilizar tipologia (se T3, tentar T2 e T4)
        if (baseParams.rooms) {
            const roomNum = parseInt(baseParams.rooms.replace('T', ''));
            
            for (const adjustment of [-1, +1]) {
                const newRoomNum = roomNum + adjustment;
                if (newRoomNum > 0 && newRoomNum <= 6) {
                    const flexParams = { ...baseParams };
                    flexParams.rooms = `T${newRoomNum}`;
                    fallbackUrls.push({
                        url: this.buildSearchUrl(flexParams),
                        description: `Pesquisa com ${flexParams.rooms}`
                    });
                }
            }

            // Sem filtro de tipologia
            const noRoomsParams = { ...baseParams };
            delete noRoomsParams.rooms;
            fallbackUrls.push({
                url: this.buildSearchUrl(noRoomsParams),
                description: 'Pesquisa sem filtro de tipologia'
            });
        }

        // 3. Flexibilizar preço (+/- 20%)
        if (baseParams.priceRange?.max) {
            const flexPriceParams = { ...baseParams };
            flexPriceParams.priceRange = {
                ...flexPriceParams.priceRange,
                max: Math.round(baseParams.priceRange.max * 1.2)
            };
            fallbackUrls.push({
                url: this.buildSearchUrl(flexPriceParams),
                description: `Pesquisa com preço flexível (+20%)`
            });
        }

        console.log(`🔄 ${fallbackUrls.length} URLs alternativas geradas`);
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
