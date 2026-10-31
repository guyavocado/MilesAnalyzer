// Additional album candidates checked against artist and label catalogues.
const EXTRA_INSTRUMENT_ALBUMS={sitar:[
  ...[
    ["Anoushka",1998,"Early recital recording."],
    ["Anourag",2000,"Classical ragas in her early recorded repertoire."],
    ["Live at Carnegie Hall",2001,"A concert recording from her early career."],
    ["Breathing Under Water",2007,"A collaboration with Karsh Kale."],
    ["Home",2015,"A return to the classical raga recital."],
    ["Shankar: Symphony",2012,"Sitar and orchestra share a concert work."],
    ["Between Us",2022,"An orchestral collaboration with her ensemble."],
    ["Chapter I: Forever, For Now",2023,"The opening instalment of her mini-album trilogy."],
    ["Chapter II: How Dark It Is Before Dawn",2024,"The trilogy’s nocturnal second instalment."],
    ["Chapter III: We Return to Light",2025,"The concluding mini-album of the trilogy."]
  ].map(([title,year,note])=>({artist:"Anoushka Shankar",artistAliases:["Shankar, Anoushka"],title,year:String(year),importance:title==="Home" ? "Classical Landmark" : "Contemporary Recording",credit:"Anoushka Shankar · sitar",note,sourceUrl:title.startsWith("Chapter III") ? "https://www.anoushkashankar.com/news/chapter-iii-we-return-to-light-out-now" : "https://anoushkashankar.com/music"})),
  ...[
    ["Ustad Vilayat Khan: Plays Sitar",1955,"Rageshwari and Pilu; Sampta Prasad accompanies."],
    ["Music of India: Vilayat Khan - No 2",1963,"Suha Sigrai and a Piloo thumri."],
    ["The Great Heritage",1966,"Yaman Kalyan and Jhinjoti."],
    ["The Genius of: Vilayat Khan",1966,"Ahir Bhairav and a Khammaj thumri."],
    ["A Night at the Taj",1967,"Chandni Kedar with Imrat Khan’s surbahar."],
    ["The Supreme Genius of Ustad Vilayat Khan",1968,"An extended Darbari Kanada performance."],
    ["Ameer Khusrau: A Tribute by Ustad Vilayat Khan",1975,"Saazgiri with Kishan Maharaj on tabla."],
    ["The Brilliance of Sound",1979,"Ghara, Sindhi Bhairavi and a Punjabi dhun."],
    ["Enchanting All The Way",1980,"Mand Bhairav and Mishra Mand."],
    ["Aftaab-E-Sitar",1985,"Bahar and a Khammaj ragamalika."]
  ].map(([title,year,note])=>({artist:"Vilayat Khan",artistAliases:["Khan, Vilayat","Ustad Vilayat Khan"],title,year:String(year),importance:"Classical Recording",credit:"Vilayat Khan · sitar",note,sourceUrl:"https://vilayatkhan.com/vk/?page_id=183"})),
  {artist:"Ravi Shankar & Ali Akbar Khan",artistAliases:["Ravi Shankar","Shankar, Ravi","Ali Akbar Khan & Ravi Shankar"],title:"In Concert 1972",year:"1973",importance:"Historic Concert",credit:"Ravi Shankar · sitar; Ali Akbar Khan · sarod; Alla Rakha · tabla",note:"Three ragas recorded at New York’s Philharmonic Hall in October 1972. The album followed in 1973.",sourceUrl:"https://www.harisongs.com/discography/"},
  {artist:"Ami Dang",title:"Parted Plains",year:"2019",importance:"Contemporary Recording",credit:"Ami Dang · sitar and electronics",note:"Sitar meets electronic textures in an instrumental setting.",sourceUrl:"https://amidang.bandcamp.com/album/parted-plains"},
  {artist:"Ami Dang",title:"Hukam",year:"2011",importance:"Contemporary Recording",credit:"Ami Dang · sitar and voice",note:"Sitar, singing and electronic production in an experimental pop setting.",sourceUrl:"https://amidang.bandcamp.com/album/hukam"},
  {artist:"Purbayan Chatterjee",title:"Unbounded (Abaad)",year:"2021",importance:"Fusion Recording",credit:"Purbayan Chatterjee · sitar",note:"An ensemble project connecting Hindustani music with jazz and other traditions.",sourceUrl:"https://purbayanchatterjee.bandcamp.com/album/unbounded-abaad"}
]};
