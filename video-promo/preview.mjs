import {serve} from './server.mjs';
const {url}=await serve(Number(process.env.FILM_PORT||0));
console.log(url+' — browser console: playFilm() or seek(seconds); preview has no audio mixer.');
