export type Country = {
  code: string;
  name: string;
  aliases: string[];
};

export const COUNTRIES: Country[] = [
  { code: "AF", name: "Afghanistan", aliases: ["Afghan"] },
  { code: "AL", name: "Albania", aliases: ["Albanian"] },
  { code: "DZ", name: "Algeria", aliases: ["Algerian"] },
  { code: "AS", name: "American Samoa", aliases: [] },
  { code: "AD", name: "Andorra", aliases: ["Andorran"] },
  { code: "AO", name: "Angola", aliases: ["Angolan"] },
  { code: "AG", name: "Antigua and Barbuda", aliases: ["Antiguan"] },
  { code: "AR", name: "Argentina", aliases: ["Argentine", "Argentinian"] },
  { code: "AM", name: "Armenia", aliases: ["Armenian"] },
  { code: "AU", name: "Australia", aliases: ["Australian", "Aussie", "AUS"] },
  { code: "AT", name: "Austria", aliases: ["Austrian", "AUT", "Österreich"] },
  { code: "AZ", name: "Azerbaijan", aliases: ["Azerbaijani"] },
  { code: "BS", name: "Bahamas", aliases: ["Bahamian"] },
  { code: "BH", name: "Bahrain", aliases: ["Bahraini"] },
  { code: "BD", name: "Bangladesh", aliases: ["Bangladeshi"] },
  { code: "BB", name: "Barbados", aliases: ["Barbadian"] },
  { code: "BY", name: "Belarus", aliases: ["Belarusian"] },
  { code: "BE", name: "Belgium", aliases: ["Belgian", "BEL"] },
  { code: "BZ", name: "Belize", aliases: ["Belizean"] },
  { code: "BJ", name: "Benin", aliases: ["Beninese"] },
  { code: "BT", name: "Bhutan", aliases: ["Bhutanese"] },
  { code: "BO", name: "Bolivia", aliases: ["Bolivian"] },
  { code: "BA", name: "Bosnia and Herzegovina", aliases: ["Bosnian"] },
  { code: "BW", name: "Botswana", aliases: ["Motswana"] },
  { code: "BR", name: "Brazil", aliases: ["Brazilian", "BRA", "Brasil"] },
  { code: "BN", name: "Brunei", aliases: ["Bruneian"] },
  { code: "BG", name: "Bulgaria", aliases: ["Bulgarian"] },
  { code: "BF", name: "Burkina Faso", aliases: ["Burkinabe"] },
  { code: "BI", name: "Burundi", aliases: ["Burundian"] },
  { code: "CV", name: "Cabo Verde", aliases: ["Cape Verdean", "Cape Verde"] },
  { code: "KH", name: "Cambodia", aliases: ["Cambodian"] },
  { code: "CM", name: "Cameroon", aliases: ["Cameroonian"] },
  { code: "CA", name: "Canada", aliases: ["Canadian", "CAN"] },
  { code: "CF", name: "Central African Republic", aliases: [] },
  { code: "TD", name: "Chad", aliases: ["Chadian"] },
  { code: "CL", name: "Chile", aliases: ["Chilean", "CHI"] },
  { code: "CN", name: "China", aliases: ["Chinese", "CHN", "PRC"] },
  { code: "CO", name: "Colombia", aliases: ["Colombian", "COL"] },
  { code: "KM", name: "Comoros", aliases: ["Comorian"] },
  { code: "CG", name: "Congo", aliases: ["Congolese"] },
  { code: "CD", name: "Congo (DRC)", aliases: ["DRC", "Congolese"] },
  { code: "CR", name: "Costa Rica", aliases: ["Costa Rican"] },
  { code: "CI", name: "Côte d'Ivoire", aliases: ["Ivorian", "Ivory Coast"] },
  { code: "HR", name: "Croatia", aliases: ["Croatian", "CRO", "Hrvatska"] },
  { code: "CU", name: "Cuba", aliases: ["Cuban", "CUB"] },
  { code: "CY", name: "Cyprus", aliases: ["Cypriot"] },
  { code: "CZ", name: "Czechia", aliases: ["Czech", "Czech Republic", "CZE"] },
  { code: "DK", name: "Denmark", aliases: ["Danish", "Dane", "DEN", "Danmark"] },
  { code: "DJ", name: "Djibouti", aliases: ["Djiboutian"] },
  { code: "DM", name: "Dominica", aliases: ["Dominican"] },
  { code: "DO", name: "Dominican Republic", aliases: ["Dominican", "DOM"] },
  { code: "EC", name: "Ecuador", aliases: ["Ecuadorian", "ECU"] },
  { code: "EG", name: "Egypt", aliases: ["Egyptian", "EGY"] },
  { code: "SV", name: "El Salvador", aliases: ["Salvadoran"] },
  { code: "GQ", name: "Equatorial Guinea", aliases: [] },
  { code: "ER", name: "Eritrea", aliases: ["Eritrean"] },
  { code: "EE", name: "Estonia", aliases: ["Estonian", "EST"] },
  { code: "SZ", name: "Eswatini", aliases: ["Swazi", "Swaziland"] },
  { code: "ET", name: "Ethiopia", aliases: ["Ethiopian", "ETH"] },
  { code: "FJ", name: "Fiji", aliases: ["Fijian"] },
  { code: "FI", name: "Finland", aliases: ["Finnish", "Finn", "FIN", "Suomi"] },
  { code: "FR", name: "France", aliases: ["French", "FRA", "Français"] },
  { code: "GA", name: "Gabon", aliases: ["Gabonese"] },
  { code: "GM", name: "Gambia", aliases: ["Gambian"] },
  { code: "GE", name: "Georgia", aliases: ["Georgian"] },
  { code: "DE", name: "Germany", aliases: ["German", "GER", "Deutschland"] },
  { code: "GH", name: "Ghana", aliases: ["Ghanaian", "GHA"] },
  { code: "GR", name: "Greece", aliases: ["Greek", "GRE", "Hellas"] },
  { code: "GD", name: "Grenada", aliases: ["Grenadian"] },
  { code: "GT", name: "Guatemala", aliases: ["Guatemalan"] },
  { code: "GN", name: "Guinea", aliases: ["Guinean"] },
  { code: "GW", name: "Guinea-Bissau", aliases: [] },
  { code: "GY", name: "Guyana", aliases: ["Guyanese"] },
  { code: "HT", name: "Haiti", aliases: ["Haitian"] },
  { code: "HN", name: "Honduras", aliases: ["Honduran"] },
  { code: "HK", name: "Hong Kong", aliases: ["HKG"] },
  { code: "HU", name: "Hungary", aliases: ["Hungarian", "HUN", "Magyar"] },
  { code: "IS", name: "Iceland", aliases: ["Icelandic", "ISL", "Ísland"] },
  { code: "IN", name: "India", aliases: ["Indian", "IND"] },
  { code: "ID", name: "Indonesia", aliases: ["Indonesian", "IDN"] },
  { code: "IR", name: "Iran", aliases: ["Iranian", "IRN", "Persian"] },
  { code: "IQ", name: "Iraq", aliases: ["Iraqi", "IRQ"] },
  { code: "IE", name: "Ireland", aliases: ["Irish", "IRL", "Éire"] },
  { code: "IL", name: "Israel", aliases: ["Israeli", "ISR"] },
  { code: "IT", name: "Italy", aliases: ["Italian", "ITA", "Italia"] },
  { code: "JM", name: "Jamaica", aliases: ["Jamaican", "JAM"] },
  { code: "JP", name: "Japan", aliases: ["Japanese", "JPN", "Nippon"] },
  { code: "JO", name: "Jordan", aliases: ["Jordanian", "JOR"] },
  { code: "KZ", name: "Kazakhstan", aliases: ["Kazakh", "KAZ"] },
  { code: "KE", name: "Kenya", aliases: ["Kenyan", "KEN"] },
  { code: "KI", name: "Kiribati", aliases: [] },
  { code: "KP", name: "North Korea", aliases: ["DPRK"] },
  { code: "KR", name: "South Korea", aliases: ["Korean", "KOR", "Korea"] },
  { code: "KW", name: "Kuwait", aliases: ["Kuwaiti", "KUW"] },
  { code: "KG", name: "Kyrgyzstan", aliases: ["Kyrgyz"] },
  { code: "LA", name: "Laos", aliases: ["Lao", "Laotian"] },
  { code: "LV", name: "Latvia", aliases: ["Latvian", "LAT"] },
  { code: "LB", name: "Lebanon", aliases: ["Lebanese", "LEB", "LBN"] },
  { code: "LS", name: "Lesotho", aliases: ["Mosotho"] },
  { code: "LR", name: "Liberia", aliases: ["Liberian"] },
  { code: "LY", name: "Libya", aliases: ["Libyan"] },
  { code: "LI", name: "Liechtenstein", aliases: [] },
  { code: "LT", name: "Lithuania", aliases: ["Lithuanian", "LTU"] },
  { code: "LU", name: "Luxembourg", aliases: ["Luxembourgish", "LUX"] },
  { code: "MO", name: "Macao", aliases: ["Macanese", "Macau"] },
  { code: "MG", name: "Madagascar", aliases: ["Malagasy"] },
  { code: "MW", name: "Malawi", aliases: ["Malawian"] },
  { code: "MY", name: "Malaysia", aliases: ["Malaysian", "MAS", "MYS"] },
  { code: "MV", name: "Maldives", aliases: ["Maldivian"] },
  { code: "ML", name: "Mali", aliases: ["Malian"] },
  { code: "MT", name: "Malta", aliases: ["Maltese", "MLT"] },
  { code: "MH", name: "Marshall Islands", aliases: ["Marshallese"] },
  { code: "MR", name: "Mauritania", aliases: ["Mauritanian"] },
  { code: "MU", name: "Mauritius", aliases: ["Mauritian"] },
  { code: "MX", name: "Mexico", aliases: ["Mexican", "MEX", "México"] },
  { code: "FM", name: "Micronesia", aliases: ["Micronesian"] },
  { code: "MD", name: "Moldova", aliases: ["Moldovan", "MDA"] },
  { code: "MC", name: "Monaco", aliases: ["Monégasque", "Monacan"] },
  { code: "MN", name: "Mongolia", aliases: ["Mongolian", "MGL"] },
  { code: "ME", name: "Montenegro", aliases: ["Montenegrin", "MNE"] },
  { code: "MA", name: "Morocco", aliases: ["Moroccan", "MAR"] },
  { code: "MZ", name: "Mozambique", aliases: ["Mozambican"] },
  { code: "MM", name: "Myanmar", aliases: ["Burmese", "Burma"] },
  { code: "NA", name: "Namibia", aliases: ["Namibian", "NAM"] },
  { code: "NR", name: "Nauru", aliases: ["Nauruan"] },
  { code: "NP", name: "Nepal", aliases: ["Nepali", "Nepalese", "NEP"] },
  { code: "NL", name: "Netherlands", aliases: ["Dutch", "NED", "Holland"] },
  { code: "NZ", name: "New Zealand", aliases: ["Kiwi", "NZL"] },
  { code: "NI", name: "Nicaragua", aliases: ["Nicaraguan", "NCA"] },
  { code: "NE", name: "Niger", aliases: ["Nigerien"] },
  { code: "NG", name: "Nigeria", aliases: ["Nigerian", "NGA"] },
  { code: "MK", name: "North Macedonia", aliases: ["Macedonian", "MKD"] },
  { code: "NO", name: "Norway", aliases: ["Norwegian", "NOR", "Norge"] },
  { code: "OM", name: "Oman", aliases: ["Omani", "OMA"] },
  { code: "PK", name: "Pakistan", aliases: ["Pakistani", "PAK"] },
  { code: "PW", name: "Palau", aliases: ["Palauan"] },
  { code: "PS", name: "Palestine", aliases: ["Palestinian"] },
  { code: "PA", name: "Panama", aliases: ["Panamanian", "PAN"] },
  { code: "PG", name: "Papua New Guinea", aliases: ["Papua New Guinean", "PNG"] },
  { code: "PY", name: "Paraguay", aliases: ["Paraguayan", "PAR"] },
  { code: "PE", name: "Peru", aliases: ["Peruvian", "PER"] },
  { code: "PH", name: "Philippines", aliases: ["Filipino", "Filipina", "PHI"] },
  { code: "PL", name: "Poland", aliases: ["Polish", "POL", "Polska"] },
  { code: "PT", name: "Portugal", aliases: ["Portuguese", "POR"] },
  { code: "PR", name: "Puerto Rico", aliases: ["Puerto Rican", "PUR"] },
  { code: "QA", name: "Qatar", aliases: ["Qatari", "QAT"] },
  { code: "RO", name: "Romania", aliases: ["Romanian", "ROU"] },
  { code: "RU", name: "Russia", aliases: ["Russian", "RUS", "Россия"] },
  { code: "RW", name: "Rwanda", aliases: ["Rwandan", "RWA"] },
  { code: "KN", name: "Saint Kitts and Nevis", aliases: [] },
  { code: "LC", name: "Saint Lucia", aliases: ["Saint Lucian"] },
  { code: "VC", name: "Saint Vincent and the Grenadines", aliases: ["Vincentian"] },
  { code: "WS", name: "Samoa", aliases: ["Samoan"] },
  { code: "SM", name: "San Marino", aliases: ["Sammarinese"] },
  { code: "ST", name: "São Tomé and Príncipe", aliases: [] },
  { code: "SA", name: "Saudi Arabia", aliases: ["Saudi", "KSA"] },
  { code: "SN", name: "Senegal", aliases: ["Senegalese", "SEN"] },
  { code: "RS", name: "Serbia", aliases: ["Serbian", "SRB"] },
  { code: "SC", name: "Seychelles", aliases: ["Seychellois"] },
  { code: "SL", name: "Sierra Leone", aliases: ["Sierra Leonean"] },
  { code: "SG", name: "Singapore", aliases: ["Singaporean", "SGP"] },
  { code: "SK", name: "Slovakia", aliases: ["Slovak", "SVK"] },
  { code: "SI", name: "Slovenia", aliases: ["Slovenian", "SLO"] },
  { code: "SB", name: "Solomon Islands", aliases: [] },
  { code: "SO", name: "Somalia", aliases: ["Somali", "SOM"] },
  { code: "ZA", name: "South Africa", aliases: ["South African", "RSA"] },
  { code: "SS", name: "South Sudan", aliases: ["South Sudanese"] },
  { code: "ES", name: "Spain", aliases: ["Spanish", "ESP", "España"] },
  { code: "LK", name: "Sri Lanka", aliases: ["Sri Lankan", "SRI"] },
  { code: "SD", name: "Sudan", aliases: ["Sudanese", "SUD"] },
  { code: "SR", name: "Suriname", aliases: ["Surinamese"] },
  { code: "SE", name: "Sweden", aliases: ["Swedish", "SWE", "Sverige"] },
  { code: "CH", name: "Switzerland", aliases: ["Swiss", "SUI", "Schweiz"] },
  { code: "SY", name: "Syria", aliases: ["Syrian", "SYR"] },
  { code: "TW", name: "Taiwan", aliases: ["Taiwanese", "TPE"] },
  { code: "TJ", name: "Tajikistan", aliases: ["Tajik", "TJK"] },
  { code: "TZ", name: "Tanzania", aliases: ["Tanzanian", "TAN"] },
  { code: "TH", name: "Thailand", aliases: ["Thai", "THA"] },
  { code: "TL", name: "Timor-Leste", aliases: ["Timorese", "East Timor"] },
  { code: "TG", name: "Togo", aliases: ["Togolese"] },
  { code: "TO", name: "Tonga", aliases: ["Tongan"] },
  { code: "TT", name: "Trinidad and Tobago", aliases: ["Trinidadian", "TTO"] },
  { code: "TN", name: "Tunisia", aliases: ["Tunisian", "TUN"] },
  { code: "TR", name: "Turkey", aliases: ["Turkish", "TUR", "Türkiye"] },
  { code: "TM", name: "Turkmenistan", aliases: ["Turkmen"] },
  { code: "TV", name: "Tuvalu", aliases: ["Tuvaluan"] },
  { code: "UG", name: "Uganda", aliases: ["Ugandan", "UGA"] },
  { code: "UA", name: "Ukraine", aliases: ["Ukrainian", "UKR"] },
  { code: "AE", name: "United Arab Emirates", aliases: ["Emirati", "UAE"] },
  { code: "GB", name: "United Kingdom", aliases: ["British", "UK", "GBR", "England", "English", "Scottish", "Welsh"] },
  { code: "US", name: "United States", aliases: ["American", "USA", "U.S.", "U.S.A."] },
  { code: "UY", name: "Uruguay", aliases: ["Uruguayan", "URU"] },
  { code: "UZ", name: "Uzbekistan", aliases: ["Uzbek", "UZB"] },
  { code: "VU", name: "Vanuatu", aliases: ["Ni-Vanuatu"] },
  { code: "VA", name: "Vatican City", aliases: [] },
  { code: "VE", name: "Venezuela", aliases: ["Venezuelan", "VEN"] },
  { code: "VN", name: "Vietnam", aliases: ["Vietnamese", "VIE"] },
  { code: "YE", name: "Yemen", aliases: ["Yemeni", "YEM"] },
  { code: "ZM", name: "Zambia", aliases: ["Zambian", "ZAM"] },
  { code: "ZW", name: "Zimbabwe", aliases: ["Zimbabwean", "ZIM"] },
];

const CODE_MAP = new Map(COUNTRIES.map((c) => [c.code, c]));

export function findCountryByCode(code: string): Country | undefined {
  return CODE_MAP.get(code.toUpperCase());
}

export function searchCountries(query: string): Country[] {
  if (!query) return COUNTRIES;
  const q = query.toLowerCase();
  return COUNTRIES.filter(
    (c) =>
      c.code.toLowerCase() === q ||
      c.name.toLowerCase().includes(q) ||
      c.aliases.some((a) => a.toLowerCase().includes(q)),
  );
}

/**
 * Attempt to resolve a free-text nationality value to an ISO alpha-2 code.
 * Checks code match, name match, and alias match (all case-insensitive).
 */
export function resolveNationalityToCode(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const upper = v.toUpperCase();

  // Exact code match
  if (CODE_MAP.has(upper)) return upper;

  // Name or alias match (case-insensitive)
  const lower = v.toLowerCase();
  for (const c of COUNTRIES) {
    if (c.name.toLowerCase() === lower) return c.code;
    if (c.aliases.some((a) => a.toLowerCase() === lower)) return c.code;
  }

  // Partial name match (if unique)
  const partials = COUNTRIES.filter((c) => c.name.toLowerCase().includes(lower));
  if (partials.length === 1) return partials[0].code;

  return null;
}
