// yazı tipleri (next/font: derlemede indirilir, siteden sunulur). Archivo genişlik ekseniyle; Fragment Mono yalnız ölçüler için
import { Archivo, Fragment_Mono } from 'next/font/google';

export const sans = Archivo({ subsets: ['latin', 'latin-ext'], axes: ['wdth'], variable: '--f-sans', display: 'swap' });
export const mono = Fragment_Mono({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--f-mono', display: 'swap' });
export const fontVars = `${sans.variable} ${mono.variable}`;
