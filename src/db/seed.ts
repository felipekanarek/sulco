import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'sulco.db');
const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client, { schema });

type TrackSeed = {
  position: string;
  title: string;
  duration?: string;
  selected?: boolean;
  bpm?: number;
  musicalKey?: string;
  energy?: number;
  moods?: string[];
  contexts?: string[];
  fineGenre?: string;
  references?: string;
  comment?: string;
};

type RecordSeed = {
  discogsId: number;
  artist: string;
  title: string;
  year: number;
  label: string;
  country: string;
  format: string;
  genres: string[];
  styles: string[];
  status: 'unrated' | 'active' | 'discarded';
  shelfLocation?: string;
  tracks: TrackSeed[];
};

/* ---------- 30 discos curados para dar realismo ao MVP ---------- */
const DATA: RecordSeed[] = [
  {
    discogsId: 374574, artist: 'Arthur Verocai', title: 'Arthur Verocai',
    year: 1972, label: 'Continental', country: 'Brasil', format: 'LP, Album, RE',
    genres: ['Jazz', 'Funk / Soul', 'Latin'], styles: ['MPB', 'Samba Soul', 'Cinematic'],
    status: 'active', shelfLocation: 'E1-P1',
    tracks: [
      { position: 'A1', title: 'Caboclo', selected: true, bpm: 96, musicalKey: 'Am', energy: 3,
        moods: ['cinematográfico', 'melancólico'], contexts: ['abertura', 'warm-up'],
        fineGenre: 'samba soul orquestral',
        references: 'arranjo lembra Serge Gainsbourg',
        comment: 'Abertura perfeita. Cordas introduzem o set, funciona depois de qualquer ambiente.' },
      { position: 'A2', title: 'Pelas Sombras', selected: true, bpm: 102, musicalKey: 'Dm', energy: 3,
        moods: ['misterioso'], contexts: ['transição'], fineGenre: 'samba psicodélico',
        comment: 'Transição natural da A1. Base de samba mais marcada.' },
      { position: 'A3', title: 'Dedicada a Ela', selected: true, bpm: 88, musicalKey: 'F', energy: 2,
        moods: ['romântico'], contexts: ['pausa', 'jantar'], fineGenre: 'bossa orquestral',
        comment: 'Respiro. Segura bem público sentado, jantar.' },
      { position: 'A4', title: 'Velho Parente', selected: false, bpm: 94, energy: 2,
        comment: 'Bonita mas raramente encaixa. Voltar a testar.' },
      { position: 'A5', title: 'Presente Grego', selected: true, bpm: 110, musicalKey: 'Gm', energy: 4,
        moods: ['quente', 'psicodélico'], contexts: ['pico'], fineGenre: 'samba rock psicodélico',
        comment: 'Faixa mais dançante do lado A. Guitarras fuzz.' },
      { position: 'B1', title: 'Sylvia', selected: true, bpm: 92, musicalKey: 'Dm', energy: 3,
        moods: ['melancólico', 'sofisticado'], contexts: ['jantar', 'após-pico'],
        fineGenre: 'jazz orquestral', comment: 'A mais conhecida. Jazz fino, público educado.' },
      { position: 'B2', title: 'Na Boca do Sol', selected: true, bpm: 108, musicalKey: 'Am', energy: 4,
        moods: ['solar', 'festivo', 'brasileirismo'], contexts: ['pico', 'festa diurna'],
        fineGenre: 'samba soul', references: 'Joyce, Azymuth em modo mais solar',
        comment: 'Alegre. Pede sol, cerveja, dança leve. Ponte para house brasileiro.' },
      { position: 'B3', title: 'Karina', selected: true, bpm: 104, musicalKey: 'C', energy: 3,
        moods: ['nostálgico'], contexts: ['transição'], fineGenre: 'MPB cinematográfica',
        comment: 'Cordas arrebatadoras. Amarra bem com Floating Points.' },
      { position: 'B4', title: 'Seriado', selected: false, comment: 'Não avaliada ainda.' },
      { position: 'B5', title: 'O Mapa', selected: true, bpm: 116, musicalKey: 'F', energy: 4,
        moods: ['afro-brasileiro'], contexts: ['pico'], fineGenre: 'samba afrobeat',
        comment: 'Ritmo percussivo forte.' },
      { position: 'B6', title: 'Mehari Amarelo', selected: true, bpm: 74, musicalKey: 'Bbm', energy: 2,
        moods: ['sonhador'], contexts: ['encerramento', 'after'], fineGenre: 'folk cinematográfico',
        comment: 'Fechamento. Cinematográfica.' },
    ],
  },
  {
    discogsId: 1034123, artist: 'Milton Nascimento & Lô Borges', title: 'Clube da Esquina',
    year: 1972, label: 'EMI-Odeon', country: 'Brasil', format: '2×LP, Album',
    genres: ['Folk, World, & Country', 'Pop'], styles: ['MPB'],
    status: 'active', shelfLocation: 'E1-P1',
    tracks: [
      { position: 'A1', title: 'Tudo Que Você Podia Ser', selected: true, bpm: 128, musicalKey: 'Em', energy: 4,
        moods: ['intenso', 'urgente'], contexts: ['pico'], fineGenre: 'MPB progressiva',
        comment: 'Abertura eletrizante. Dispara o set.' },
      { position: 'A2', title: 'Cais', selected: true, bpm: 72, musicalKey: 'Am', energy: 2,
        moods: ['contemplativo', 'oceânico'], contexts: ['encerramento', 'jantar'],
        fineGenre: 'MPB contemplativa', comment: 'Poesia pura.' },
      { position: 'A3', title: 'O Trem Azul', selected: true, bpm: 100, musicalKey: 'Dm', energy: 3,
        moods: ['nostálgico'], contexts: ['warm-up'], fineGenre: 'MPB', comment: 'Clássico atemporal.' },
      { position: 'A4', title: 'Saídas e Bandeiras No.1', selected: false },
      { position: 'A5', title: 'Nuvem Cigana', selected: true, bpm: 96, energy: 3,
        moods: ['sonhador'], contexts: ['warm-up'], comment: 'Lô Borges em ótima forma.' },
      { position: 'B1', title: 'Cravo e Canela', selected: true, bpm: 118, energy: 4,
        moods: ['dançante', 'solar'], contexts: ['pico'], fineGenre: 'MPB samba',
        comment: 'Ritmo contagiante.' },
      { position: 'B2', title: 'Dos Cruces', selected: false },
      { position: 'B3', title: 'Um Girassol da Cor de Seu Cabelo', selected: true, bpm: 86, energy: 2,
        moods: ['romântico'], contexts: ['jantar'], comment: 'Delicada.' },
      { position: 'B4', title: 'San Vicente', selected: false },
      { position: 'C1', title: 'Estrelas', selected: false },
      { position: 'C2', title: 'Clube da Esquina No.2', selected: true, bpm: 90, energy: 2,
        moods: ['contemplativo', 'cinematográfico'], contexts: ['encerramento'],
        comment: 'Instrumental. Icônica.' },
      { position: 'D1', title: 'Lilia', selected: true, bpm: 92, energy: 3,
        moods: ['afetivo'], contexts: ['warm-up'], comment: 'Favorita pessoal.' },
    ],
  },
  {
    discogsId: 1229380, artist: 'Alice Coltrane', title: 'Journey in Satchidananda',
    year: 1971, label: 'Impulse!', country: 'US', format: 'LP, Album',
    genres: ['Jazz'], styles: ['Spiritual Jazz', 'Modal'],
    status: 'active', shelfLocation: 'E2-P1',
    tracks: [
      { position: 'A1', title: 'Journey in Satchidananda', selected: true, bpm: 84, musicalKey: 'Em', energy: 3,
        moods: ['espiritual', 'hipnótico'], contexts: ['abertura', 'warm-up', 'jantar'],
        fineGenre: 'spiritual jazz modal',
        references: 'tambura + harpa, meditativo',
        comment: 'Abertura cósmica. Funciona em qualquer ambiente contemplativo.' },
      { position: 'A2', title: 'Shiva-Loka', selected: true, bpm: 90, energy: 3,
        moods: ['modal', 'hipnótico'], contexts: ['warm-up'], fineGenre: 'spiritual jazz' },
      { position: 'A3', title: 'Stopover Bombay', selected: false },
      { position: 'B1', title: 'Something About John Coltrane', selected: true, bpm: 82, energy: 2,
        moods: ['reverente', 'melancólico'], contexts: ['jantar', 'encerramento'],
        comment: 'Homenagem. Muito lenta, escolher bem o momento.' },
      { position: 'B2', title: 'Isis and Osiris', selected: true, bpm: 76, energy: 2,
        moods: ['místico'], contexts: ['encerramento'], fineGenre: 'ambient jazz' },
    ],
  },
  {
    discogsId: 18014502, artist: 'Floating Points, Pharoah Sanders & LSO', title: 'Promises',
    year: 2021, label: 'Luaka Bop', country: 'UK', format: 'LP, Album',
    genres: ['Electronic', 'Jazz', 'Classical'], styles: ['Ambient', 'Contemporary'],
    status: 'active', shelfLocation: 'E4-P1',
    tracks: [
      { position: 'A1', title: 'Movement 1', selected: true, bpm: 64, musicalKey: 'C', energy: 2,
        moods: ['transcendente', 'cinematográfico'], contexts: ['abertura', 'jantar'],
        fineGenre: 'ambient jazz contemporâneo',
        comment: 'Pedir silêncio total. Abre qualquer set com peso.' },
      { position: 'A2', title: 'Movement 2', selected: false },
      { position: 'A3', title: 'Movement 3', selected: true, bpm: 72, energy: 2,
        moods: ['transcendente'], contexts: ['jantar'], comment: 'Pharoah entra em cena.' },
      { position: 'A4', title: 'Movement 4', selected: false },
      { position: 'A5', title: 'Movement 5', selected: false },
      { position: 'B1', title: 'Movement 6', selected: true, bpm: 80, energy: 3,
        moods: ['elevado'], contexts: ['transição'], comment: 'Orquestra entra.' },
      { position: 'B2', title: 'Movement 7', selected: false },
      { position: 'B3', title: 'Movement 8', selected: false },
      { position: 'B4', title: 'Movement 9', selected: true, energy: 1,
        moods: ['encerramento'], contexts: ['encerramento'], comment: 'Silêncio quase total.' },
    ],
  },
  {
    discogsId: 28344, artist: 'Azymuth', title: 'Light as a Feather',
    year: 1979, label: 'Milestone', country: 'US', format: 'LP, Album',
    genres: ['Jazz', 'Funk / Soul'], styles: ['Jazz-Funk', 'Fusion'],
    status: 'active', shelfLocation: 'E2-P2',
    tracks: [
      { position: 'A1', title: 'Jazz Carnival', selected: true, bpm: 114, musicalKey: 'F', energy: 4,
        moods: ['festivo', 'solar', 'brasileirismo'], contexts: ['pico', 'festa diurna'],
        fineGenre: 'jazz-funk brasileiro', references: 'hit eterno',
        comment: 'Sempre funciona. Cuidado para não esgastar.' },
      { position: 'A2', title: 'Fly Over the Horizon', selected: true, bpm: 100, musicalKey: 'Dm', energy: 3,
        moods: ['voador'], contexts: ['transição'], fineGenre: 'jazz-funk' },
      { position: 'A3', title: 'Partido Alto', selected: true, bpm: 118, musicalKey: 'Am', energy: 4,
        moods: ['festivo', 'quente'], contexts: ['pico'], fineGenre: 'samba jazz',
        comment: 'Alternativa à Jazz Carnival. Menos tocada, igual de boa.' },
      { position: 'A4', title: 'Young Embrace', selected: false },
      { position: 'B1', title: 'Tomorrow', selected: true, bpm: 108, energy: 3,
        moods: ['esperançoso'], contexts: ['warm-up'] },
      { position: 'B2', title: 'Captain Bacardi', selected: true, bpm: 112, energy: 4,
        moods: ['quente'], contexts: ['pico'] },
      { position: 'B3', title: 'Pedra Do Sol', selected: false },
    ],
  },
  {
    discogsId: 5672, artist: 'Moodymann', title: 'Silentintroduction',
    year: 1997, label: 'Planet E', country: 'US', format: '2×LP, Album',
    genres: ['Electronic'], styles: ['Deep House', 'Detroit House'],
    status: 'active', shelfLocation: 'E5-P1',
    tracks: [
      { position: 'A1', title: 'Sunday Morning', selected: true, bpm: 120, musicalKey: 'Am', energy: 3,
        moods: ['groovy', 'gospel'], contexts: ['warm-up house', 'pico'],
        fineGenre: 'deep house detroit', comment: 'Clássico. Acessível e soulful.' },
      { position: 'A2', title: 'Music People', selected: true, bpm: 122, energy: 4,
        moods: ['groovy'], contexts: ['pico'] },
      { position: 'B1', title: "I Can't Kick This Feelin' When It Hits", selected: true, bpm: 121, energy: 4,
        moods: ['soulful'], contexts: ['pico'] },
      { position: 'B2', title: 'Dem Young Sconies', selected: false },
      { position: 'C1', title: 'U Can Dance If U Want 2', selected: true, bpm: 123, energy: 4,
        moods: ['dançante'], contexts: ['pico'] },
      { position: 'C2', title: 'Free Ya Mind', selected: false },
      { position: 'D1', title: "Don't Be Misled", selected: true, bpm: 119, energy: 3,
        moods: ['groovy'], contexts: ['transição'] },
      { position: 'D2', title: 'Black Mahogani', selected: false },
    ],
  },
  {
    discogsId: 29842, artist: 'Hermeto Pascoal', title: 'Slaves Mass',
    year: 1977, label: 'Warner Bros.', country: 'US', format: 'LP, Album',
    genres: ['Jazz', 'Folk, World, & Country'], styles: ['Experimental', 'Fusion'],
    status: 'active', shelfLocation: 'E1-P2',
    tracks: [
      { position: 'A1', title: 'Missa dos Escravos', selected: true, bpm: 88, energy: 3,
        moods: ['místico', 'afro-brasileiro'], contexts: ['warm-up'],
        fineGenre: 'jazz fusion brasileiro' },
      { position: 'A2', title: 'Cannon', selected: false },
      { position: 'A3', title: 'Just Listen', selected: true, bpm: 94, energy: 3,
        moods: ['experimental'], contexts: ['transição'] },
      { position: 'A4', title: 'Little Cry for Him', selected: false },
      { position: 'B1', title: 'Tacho', selected: true, bpm: 108, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
      { position: 'B2', title: 'Eleven', selected: false },
      { position: 'B3', title: "Hermeto's Daydreams", selected: false },
      { position: 'B4', title: 'Slaves Mass', selected: true, bpm: 98, energy: 4,
        moods: ['intenso'], contexts: ['pico'] },
    ],
  },
  {
    discogsId: 382922, artist: 'Four Tet', title: 'Three',
    year: 2024, label: 'Text Records', country: 'UK', format: 'LP, Album',
    genres: ['Electronic'], styles: ['Folktronica', 'IDM'],
    status: 'unrated', shelfLocation: 'E5-P2',
    tracks: [
      { position: 'A1', title: 'Loved' }, { position: 'A2', title: 'Gliding Through Everything' },
      { position: 'A3', title: 'Storm Crystals' }, { position: 'B1', title: 'Skater' },
      { position: 'B2', title: 'So Blue' }, { position: 'B3', title: 'Daydream Repeat' },
    ],
  },
  {
    discogsId: 44521, artist: 'Joyce', title: 'Feminina',
    year: 1980, label: 'EMI-Odeon', country: 'Brasil', format: 'LP, Album',
    genres: ['Jazz', 'Latin'], styles: ['MPB', 'Samba'],
    status: 'active', shelfLocation: 'E1-P2',
    tracks: [
      { position: 'A1', title: 'Clareana', selected: true, bpm: 110, energy: 4,
        moods: ['solar', 'feminino'], contexts: ['pico', 'festa diurna'], fineGenre: 'samba jazz' },
      { position: 'A2', title: 'Feminina', selected: true, bpm: 96, energy: 3,
        moods: ['sofisticado'], contexts: ['warm-up'] },
      { position: 'A3', title: 'Da Cor Brasileira', selected: false },
      { position: 'B1', title: 'Essa Mulher', selected: true, bpm: 106, energy: 4,
        moods: ['solar'], contexts: ['pico'] },
      { position: 'B2', title: 'Maria da Penha', selected: false },
      { position: 'B3', title: 'Velas Içadas', selected: true, bpm: 112, energy: 4,
        moods: ['solar', 'festivo'], contexts: ['pico'], comment: 'Destaque absoluto.' },
    ],
  },
  {
    discogsId: 91132, artist: 'Gal Costa', title: 'Gal Canta Caymmi',
    year: 1976, label: 'Philips', country: 'Brasil', format: 'LP',
    genres: ['Latin'], styles: ['MPB', 'Bossa Nova'],
    status: 'active', shelfLocation: 'E1-P2',
    tracks: [
      { position: 'A1', title: 'Das Rosas', selected: true, bpm: 82, energy: 2,
        moods: ['delicado'], contexts: ['jantar'], fineGenre: 'MPB bossa' },
      { position: 'A2', title: 'Marina', selected: true, bpm: 88, energy: 2,
        moods: ['romântico'], contexts: ['jantar'] },
      { position: 'A3', title: 'Só Louco', selected: false },
      { position: 'B1', title: 'Milagre', selected: true, bpm: 94, energy: 3,
        moods: ['solar'], contexts: ['warm-up'] },
      { position: 'B2', title: 'Modinha Para Gabriela', selected: false },
      { position: 'B3', title: 'Oração de Mãe Menininha', selected: true, bpm: 78, energy: 2,
        moods: ['espiritual'], contexts: ['encerramento'] },
    ],
  },
  {
    discogsId: 115, artist: 'Pharoah Sanders', title: 'Karma',
    year: 1969, label: 'Impulse!', country: 'US', format: 'LP, Album',
    genres: ['Jazz'], styles: ['Spiritual Jazz', 'Free Jazz'],
    status: 'active', shelfLocation: 'E2-P1',
    tracks: [
      { position: 'A1', title: 'The Creator Has a Master Plan', selected: true, bpm: 92, energy: 3,
        moods: ['espiritual', 'elevado'], contexts: ['jantar', 'warm-up'],
        fineGenre: 'spiritual jazz', comment: '32 minutos. Usar trechos.' },
      { position: 'B1', title: 'Colors', selected: true, bpm: 86, energy: 2,
        moods: ['modal'], contexts: ['jantar'] },
    ],
  },
  {
    discogsId: 887, artist: 'Gilberto Gil', title: 'Refazenda',
    year: 1975, label: 'Philips', country: 'Brasil', format: 'LP',
    genres: ['Latin'], styles: ['MPB', 'Samba'],
    status: 'active', shelfLocation: 'E1-P3',
    tracks: [
      { position: 'A1', title: 'Refazenda', selected: true, bpm: 104, energy: 4,
        moods: ['solar', 'brasileirismo'], contexts: ['pico', 'festa diurna'], fineGenre: 'MPB samba' },
      { position: 'A2', title: 'Jeca Total', selected: false },
      { position: 'A3', title: 'Retiros Espirituais', selected: true, bpm: 86, energy: 2,
        moods: ['contemplativo'], contexts: ['warm-up'] },
      { position: 'B1', title: 'Lamento Sertanejo', selected: true, bpm: 80, energy: 2,
        moods: ['melancólico'], contexts: ['jantar'] },
      { position: 'B2', title: 'Tenho Sede', selected: false },
      { position: 'B3', title: 'Meditação', selected: true, bpm: 90, energy: 3,
        moods: ['esperançoso'], contexts: ['warm-up'] },
    ],
  },
  {
    discogsId: 501, artist: 'Theo Parrish', title: 'Parallel Dimensions',
    year: 2000, label: 'Sound Signature', country: 'US', format: '2×LP',
    genres: ['Electronic'], styles: ['Deep House', 'Detroit House'],
    status: 'active', shelfLocation: 'E5-P1',
    tracks: [
      { position: 'A1', title: 'Synthetic Flemm', selected: true, bpm: 124, energy: 4,
        moods: ['hipnótico'], contexts: ['pico'], fineGenre: 'deep house' },
      { position: 'B1', title: 'Moonlight', selected: true, bpm: 122, energy: 3,
        moods: ['sonhador'], contexts: ['transição'] },
      { position: 'C1', title: 'Summertime is Here', selected: true, bpm: 120, energy: 3,
        moods: ['solar'], contexts: ['warm-up house'] },
      { position: 'D1', title: 'Sweet Sticky', selected: false },
    ],
  },
  {
    discogsId: 2001, artist: 'Caetano Veloso', title: 'Caetano Veloso (Álbum Branco)',
    year: 1969, label: 'Philips', country: 'Brasil', format: 'LP',
    genres: ['Rock', 'Latin'], styles: ['Tropicália', 'MPB', 'Psychedelic Rock'],
    status: 'active', shelfLocation: 'E1-P3',
    tracks: [
      { position: 'A1', title: 'Irene', selected: true, bpm: 102, energy: 3,
        moods: ['solar'], contexts: ['warm-up'], fineGenre: 'MPB psicodélica' },
      { position: 'A2', title: 'Lost in the Paradise', selected: false },
      { position: 'A3', title: 'Cambalache', selected: false },
      { position: 'B1', title: 'Não Identificado', selected: true, bpm: 96, energy: 3,
        moods: ['sonhador'], contexts: ['warm-up'] },
      { position: 'B2', title: 'Atrás do Trio Elétrico', selected: true, bpm: 124, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
    ],
  },
  {
    discogsId: 33301, artist: 'Airto Moreira', title: 'Fingers',
    year: 1973, label: 'CTI', country: 'US', format: 'LP',
    genres: ['Jazz'], styles: ['Fusion', 'Latin Jazz'],
    status: 'active', shelfLocation: 'E2-P2',
    tracks: [
      { position: 'A1', title: 'Fingers', selected: true, bpm: 108, energy: 4,
        moods: ['quente', 'brasileirismo'], contexts: ['pico'], fineGenre: 'jazz fusion latino' },
      { position: 'A2', title: 'Tombo in 7/4', selected: true, bpm: 112, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
      { position: 'B1', title: 'Wake Up Song', selected: true, bpm: 100, energy: 3,
        moods: ['solar'], contexts: ['warm-up'] },
      { position: 'B2', title: 'Parana', selected: false },
    ],
  },
  {
    discogsId: 12, artist: 'Tim Maia', title: 'Racional Vol. 1',
    year: 1975, label: 'Seroma', country: 'Brasil', format: 'LP',
    genres: ['Funk / Soul'], styles: ['Soul', 'Funk'],
    status: 'active', shelfLocation: 'E3-P1',
    tracks: [
      { position: 'A1', title: 'Imunização Racional (Que Beleza)', selected: true, bpm: 106, energy: 4,
        moods: ['festivo', 'solar'], contexts: ['pico'], fineGenre: 'soul brasileiro',
        comment: 'Hit universal.' },
      { position: 'A2', title: 'Bom Senso', selected: true, bpm: 98, energy: 3,
        moods: ['groovy'], contexts: ['warm-up'] },
      { position: 'A3', title: 'Você e Eu, Eu e Você (Juntinhos)', selected: true, bpm: 90, energy: 3,
        moods: ['romântico'], contexts: ['warm-up'] },
      { position: 'B1', title: 'Universo em Desencanto', selected: false },
      { position: 'B2', title: 'Contato com o Astral', selected: true, bpm: 94, energy: 3,
        moods: ['místico'], contexts: ['transição'] },
      { position: 'B3', title: 'O Caminho do Bem', selected: true, bpm: 102, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
    ],
  },
  {
    discogsId: 777, artist: 'Sun Ra', title: 'Lanquidity',
    year: 1978, label: 'Philly Jazz', country: 'US', format: 'LP',
    genres: ['Jazz'], styles: ['Space-Age', 'Fusion', 'Free Jazz'],
    status: 'active', shelfLocation: 'E2-P2',
    tracks: [
      { position: 'A1', title: 'Lanquidity', selected: true, bpm: 88, energy: 3,
        moods: ['cósmico', 'hipnótico'], contexts: ['warm-up'], fineGenre: 'jazz espacial' },
      { position: 'A2', title: 'Where Pathways Meet', selected: true, bpm: 112, energy: 4,
        moods: ['intenso'], contexts: ['pico'] },
      { position: 'B1', title: "That's How I Feel", selected: true, bpm: 100, energy: 3,
        moods: ['groovy'], contexts: ['transição'] },
      { position: 'B2', title: 'Twin Stars of Thence', selected: false },
    ],
  },
  {
    discogsId: 8840, artist: 'Nicolas Jaar', title: 'Space Is Only Noise',
    year: 2011, label: 'Circus Company', country: 'France', format: '2×LP',
    genres: ['Electronic'], styles: ['Downtempo', 'Ambient'],
    status: 'active', shelfLocation: 'E5-P2',
    tracks: [
      { position: 'A1', title: 'Être', selected: true, bpm: 60, energy: 1,
        moods: ['ambiente'], contexts: ['abertura'], fineGenre: 'downtempo' },
      { position: 'A2', title: 'Colomb', selected: true, bpm: 92, energy: 2,
        moods: ['misterioso'], contexts: ['warm-up'] },
      { position: 'B1', title: 'Sunflower', selected: false },
      { position: 'B2', title: 'Too Many Kids Finding Rain in the Dust', selected: true, bpm: 102, energy: 3,
        moods: ['downtempo'], contexts: ['transição'] },
      { position: 'C1', title: 'Space Is Only Noise If You Can See', selected: true, bpm: 86, energy: 3,
        moods: ['cinematográfico'], contexts: ['transição'] },
      { position: 'D1', title: 'Variations', selected: false },
    ],
  },
  {
    discogsId: 6611, artist: 'Quarteto em Cy', title: 'Querelas do Brasil',
    year: 1978, label: 'Philips', country: 'Brasil', format: 'LP',
    genres: ['Latin'], styles: ['MPB'],
    status: 'unrated', shelfLocation: 'E1-P3',
    tracks: [
      { position: 'A1', title: 'Querelas do Brasil' }, { position: 'A2', title: 'Casa Forte' },
      { position: 'A3', title: 'Tudo Que Você Podia Ser' }, { position: 'B1', title: 'Bachianinha' },
      { position: 'B2', title: 'Chão de Giz' },
    ],
  },
  {
    discogsId: 92111, artist: 'Khruangbin', title: 'Con Todo El Mundo',
    year: 2018, label: 'Night Time Stories', country: 'UK', format: 'LP',
    genres: ['Funk / Soul', 'Rock'], styles: ['Psychedelic', 'Soul'],
    status: 'active', shelfLocation: 'E4-P2',
    tracks: [
      { position: 'A1', title: 'Cómo Me Quieres', selected: true, bpm: 96, energy: 3,
        moods: ['groovy', 'sensual'], contexts: ['warm-up'], fineGenre: 'psych soul' },
      { position: 'A2', title: 'Lady and Man', selected: true, bpm: 100, energy: 3,
        moods: ['sensual'], contexts: ['warm-up'] },
      { position: 'A3', title: 'Maria También', selected: true, bpm: 104, energy: 4,
        moods: ['solar'], contexts: ['pico'] },
      { position: 'B1', title: 'August 10', selected: true, bpm: 80, energy: 2,
        moods: ['contemplativo'], contexts: ['jantar'] },
      { position: 'B2', title: 'Evan Finds the Third Room', selected: true, bpm: 114, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
      { position: 'B3', title: 'A Hymn', selected: false },
    ],
  },
  {
    discogsId: 44, artist: 'Elis Regina & Tom Jobim', title: 'Elis & Tom',
    year: 1974, label: 'Philips', country: 'Brasil', format: 'LP',
    genres: ['Jazz', 'Latin'], styles: ['Bossa Nova', 'MPB'],
    status: 'active', shelfLocation: 'E1-P1',
    tracks: [
      { position: 'A1', title: 'Águas de Março', selected: true, bpm: 120, energy: 4,
        moods: ['solar', 'festivo'], contexts: ['pico', 'festa diurna'],
        fineGenre: 'bossa samba', comment: 'Universal. Sempre funciona.' },
      { position: 'A2', title: 'Pois É', selected: true, bpm: 100, energy: 3,
        moods: ['contemplativo'], contexts: ['warm-up'] },
      { position: 'A3', title: 'Modinha', selected: false },
      { position: 'B1', title: 'Só Tinha de Ser com Você', selected: true, bpm: 94, energy: 3,
        moods: ['romântico'], contexts: ['warm-up'] },
      { position: 'B2', title: 'Fotografia', selected: true, bpm: 88, energy: 2,
        moods: ['delicado'], contexts: ['jantar'] },
      { position: 'B3', title: 'Corcovado', selected: false },
    ],
  },
  {
    discogsId: 311, artist: 'Kaytranada', title: 'Bubba',
    year: 2019, label: 'RCA', country: 'US', format: '2×LP',
    genres: ['Electronic', 'Funk / Soul'], styles: ['House', 'Future Funk'],
    status: 'unrated', shelfLocation: 'E5-P3',
    tracks: [
      { position: 'A1', title: 'Do It' }, { position: 'A2', title: '2 The Music' },
      { position: 'A3', title: 'Go DJ' }, { position: 'B1', title: 'Puff Lah' },
      { position: 'B2', title: 'Vex Oh' }, { position: 'B3', title: 'Taste Change' },
      { position: 'C1', title: 'Freefall' }, { position: 'C2', title: 'Scared to Death' },
      { position: 'D1', title: 'Culture' }, { position: 'D2', title: 'Oh No' },
    ],
  },
  {
    discogsId: 80099, artist: 'Marcos Valle', title: 'Previsão do Tempo',
    year: 1973, label: 'EMI-Odeon', country: 'Brasil', format: 'LP',
    genres: ['Jazz', 'Latin'], styles: ['MPB', 'Jazz-Funk'],
    status: 'active', shelfLocation: 'E1-P2',
    tracks: [
      { position: 'A1', title: 'Previsão do Tempo', selected: true, bpm: 112, energy: 4,
        moods: ['solar'], contexts: ['pico'], fineGenre: 'MPB jazz-funk' },
      { position: 'A2', title: 'De Repente, Mocidade', selected: true, bpm: 108, energy: 3,
        moods: ['nostálgico'], contexts: ['warm-up'] },
      { position: 'A3', title: 'Flamengo', selected: false },
      { position: 'B1', title: 'Nem Paletó, Nem Gravata', selected: true, bpm: 116, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
      { position: 'B2', title: 'Os Ossos do Barão', selected: true, bpm: 104, energy: 4,
        moods: ['groovy'], contexts: ['pico'] },
    ],
  },
  {
    discogsId: 9000, artist: 'Larry Heard', title: 'Sceneries Not Songs, Volume 1',
    year: 1994, label: 'Black Market International', country: 'US', format: '2×LP',
    genres: ['Electronic'], styles: ['Deep House', 'Ambient'],
    status: 'active', shelfLocation: 'E5-P1',
    tracks: [
      { position: 'A1', title: 'The Sun Can Not Compare', selected: true, bpm: 118, energy: 3,
        moods: ['sonhador'], contexts: ['warm-up house'], fineGenre: 'deep house ambient' },
      { position: 'B1', title: 'Glistening Moods', selected: true, bpm: 120, energy: 3,
        moods: ['hipnótico'], contexts: ['transição'] },
      { position: 'C1', title: 'Pearl Mist', selected: false },
      { position: 'D1', title: 'Water Drops', selected: false },
    ],
  },
  {
    discogsId: 5555, artist: 'Caetano Veloso', title: 'Transa',
    year: 1972, label: 'Philips', country: 'Brasil', format: 'LP',
    genres: ['Rock', 'Latin'], styles: ['Tropicália', 'MPB'],
    status: 'active', shelfLocation: 'E1-P3',
    tracks: [
      { position: 'A1', title: "You Don't Know Me", selected: true, bpm: 96, energy: 3,
        moods: ['nostálgico'], contexts: ['warm-up'], fineGenre: 'MPB psicodélica' },
      { position: 'A2', title: 'Nine Out of Ten', selected: true, bpm: 118, energy: 4,
        moods: ['festivo', 'solar'], contexts: ['pico'] },
      { position: 'A3', title: 'Triste Bahia', selected: false },
      { position: 'B1', title: "It's a Long Way", selected: true, bpm: 100, energy: 3,
        moods: ['contemplativo'], contexts: ['transição'] },
      { position: 'B2', title: 'Mora Na Filosofia', selected: false },
      { position: 'B3', title: 'Neolithic Man', selected: false },
    ],
  },
  {
    discogsId: 6666, artist: 'Madlib', title: 'Shades of Blue',
    year: 2003, label: 'Blue Note', country: 'US', format: '2×LP',
    genres: ['Jazz', 'Hip-Hop'], styles: ['Jazz-Funk', 'Instrumental'],
    status: 'active', shelfLocation: 'E3-P2',
    tracks: [
      { position: 'A1', title: 'Mystic Bounce', selected: true, bpm: 90, energy: 3,
        moods: ['groovy', 'misterioso'], contexts: ['warm-up'], fineGenre: 'jazz-funk sampleado' },
      { position: 'A2', title: 'Distant Land', selected: true, bpm: 94, energy: 3,
        moods: ['cinematográfico'], contexts: ['transição'] },
      { position: 'B1', title: 'Slim\'s Return', selected: true, bpm: 98, energy: 3,
        moods: ['groovy'], contexts: ['warm-up'] },
      { position: 'C1', title: 'Stepping into Tomorrow', selected: false },
      { position: 'D1', title: 'Please Set Me at Ease', selected: true, bpm: 102, energy: 4,
        moods: ['quente'], contexts: ['pico'] },
    ],
  },
  {
    discogsId: 7711, artist: 'Erlend Øye', title: 'Unrest',
    year: 2003, label: 'Source', country: 'France', format: 'LP',
    genres: ['Electronic'], styles: ['IDM', 'Indietronica'],
    status: 'discarded', shelfLocation: 'E6-P1',
    tracks: [
      { position: 'A1', title: 'Ghost Trains' }, { position: 'A2', title: 'Sudden Rush' },
      { position: 'B1', title: 'Sheltered Life' }, { position: 'B2', title: 'Fried Chicken' },
    ],
  },
  {
    discogsId: 14, artist: 'Lô Borges', title: 'Lô Borges (Disco do Tênis)',
    year: 1972, label: 'EMI-Odeon', country: 'Brasil', format: 'LP',
    genres: ['Rock', 'Latin'], styles: ['MPB', 'Psychedelic Rock'],
    status: 'active', shelfLocation: 'E1-P1',
    tracks: [
      { position: 'A1', title: 'Eu Sou Como Você É', selected: true, bpm: 108, energy: 4,
        moods: ['festivo'], contexts: ['pico'], fineGenre: 'MPB rock' },
      { position: 'A2', title: 'Toda Essa Água', selected: true, bpm: 90, energy: 3,
        moods: ['nostálgico'], contexts: ['warm-up'] },
      { position: 'A3', title: 'Homem da Rua', selected: false },
      { position: 'B1', title: 'Um Girassol da Cor de Seu Cabelo', selected: false },
      { position: 'B2', title: 'Equatorial', selected: true, bpm: 100, energy: 3,
        moods: ['sonhador'], contexts: ['transição'] },
    ],
  },
  {
    discogsId: 22022, artist: 'Jamie xx', title: 'In Colour',
    year: 2015, label: 'Young Turks', country: 'UK', format: 'LP',
    genres: ['Electronic'], styles: ['House', 'UK Garage'],
    status: 'active', shelfLocation: 'E5-P3',
    tracks: [
      { position: 'A1', title: 'Gosh', selected: true, bpm: 130, energy: 4,
        moods: ['intenso'], contexts: ['pico'], fineGenre: 'UK bass' },
      { position: 'A2', title: 'Sleep Sound', selected: true, bpm: 124, energy: 3,
        moods: ['sonhador'], contexts: ['warm-up house'] },
      { position: 'A3', title: 'SeeSaw', selected: false },
      { position: 'B1', title: 'Loud Places', selected: true, bpm: 100, energy: 3,
        moods: ['nostálgico'], contexts: ['transição'] },
      { position: 'B2', title: 'I Know There\'s Gonna Be (Good Times)', selected: true, bpm: 108, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
      { position: 'B3', title: 'The Rest Is Noise', selected: false },
    ],
  },
  {
    discogsId: 33, artist: 'Jorge Ben', title: 'A Tábua de Esmeralda',
    year: 1974, label: 'Philips', country: 'Brasil', format: 'LP',
    genres: ['Latin', 'Folk, World, & Country'], styles: ['MPB', 'Samba'],
    status: 'active', shelfLocation: 'E1-P3',
    tracks: [
      { position: 'A1', title: 'Os Alquimistas Estão Chegando', selected: true, bpm: 104, energy: 4,
        moods: ['místico', 'festivo'], contexts: ['pico'], fineGenre: 'samba rock místico' },
      { position: 'A2', title: 'O Homem da Gravata Florida', selected: true, bpm: 98, energy: 3,
        moods: ['groovy'], contexts: ['warm-up'] },
      { position: 'A3', title: 'Errare Humanum Est', selected: true, bpm: 110, energy: 4,
        moods: ['festivo'], contexts: ['pico'] },
      { position: 'B1', title: 'Menina Mulher da Pele Preta', selected: true, bpm: 96, energy: 3,
        moods: ['sensual'], contexts: ['warm-up'] },
      { position: 'B2', title: 'Eu Vou Torcer', selected: false },
      { position: 'B3', title: 'Hermes Trismegisto Escreveu', selected: true, bpm: 100, energy: 3,
        moods: ['místico'], contexts: ['transição'] },
    ],
  },
];

async function seed() {
  console.log(`Semeando ${DATA.length} discos...`);

  // limpar
  await db.delete(schema.setTracks).run();
  await db.delete(schema.playlistTracks).run();
  await db.delete(schema.sets).run();
  await db.delete(schema.playlists).run();
  await db.delete(schema.tracks).run();
  await db.delete(schema.records).run();

  let totalTracks = 0;
  for (const r of DATA) {
    const [inserted] = await db.insert(schema.records).values({
      discogsId: r.discogsId, artist: r.artist, title: r.title, year: r.year,
      label: r.label, country: r.country, format: r.format,
      genres: r.genres, styles: r.styles, status: r.status,
      shelfLocation: r.shelfLocation,
    }).returning();
    for (const t of r.tracks) {
      await db.insert(schema.tracks).values({
        recordId: inserted.id, position: t.position, title: t.title,
        duration: t.duration, selected: t.selected ?? false,
        bpm: t.bpm, musicalKey: t.musicalKey, energy: t.energy,
        moods: t.moods ?? [], contexts: t.contexts ?? [],
        fineGenre: t.fineGenre, references: t.references, comment: t.comment,
      });
      totalTracks++;
    }
  }

  // Playlists exemplo
  const pl = [
    { name: 'Warm-up jazz brasileiro', description: 'Abertura contemplativa, MPB e jazz do Brasil' },
    { name: 'Peak time MPB psicodélica', description: 'Samba rock e MPB de alta energia' },
    { name: 'Fechamento contemplativo', description: 'Faixas cinematográficas para encerrar' },
  ];
  for (const p of pl) await db.insert(schema.playlists).values(p);

  // Sets de exemplo
  await db.insert(schema.sets).values({
    name: 'Aniversário da Ana', eventDate: new Date('2026-04-23T20:00:00'),
    location: 'Florianópolis', status: 'draft',
    briefing: 'Festa intimista, jantar e pista, MPB subindo para samba soul por volta de meia-noite. Fechar sonhador.',
  });
  await db.insert(schema.sets).values({
    name: 'Gabão Bar — sessão noturna', eventDate: new Date('2026-05-08T22:00:00'),
    location: 'Criciúma', status: 'scheduled',
    briefing: 'Residência mensal. Balance entre jazz brasileiro contemplativo e house orgânico.',
  });

  console.log(`✓ ${DATA.length} discos, ${totalTracks} faixas, ${pl.length} playlists, 2 sets semeados.`);
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
