// A newly published source is present in the server-rendered catalogue before it reaches the bundled seed.
// Do not replace its valid server HTML with a transient client-side 404 during the API request.
export function needsPublicProfileHydration(path,seedSources){
 const match=String(path).match(/^\/source\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
 return Boolean(match&&!seedSources.some(source=>source.id===match[1]&&source.status!=='hidden'));
}

// Render country flags locally. This removes dependence on absent SVG files and third-party hosts.
export function countryFlagEmoji(countryCode){
 if(!/^[a-z]{2}$/i.test(String(countryCode)))return '';
 return [...countryCode.toUpperCase()].map(char=>String.fromCodePoint(0x1F1E6+char.charCodeAt(0)-65)).join('');
}
