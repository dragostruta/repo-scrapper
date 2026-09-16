import { readFile } from 'node:fs/promises';

export interface Options {
  verbose: boolean;
}

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export class Greeter {
  constructor(private readonly options: Options) {}

  greet(name: string): string {
    if (this.options.verbose) {
      console.log(`Greeting ${name}`);
    }
    return greet(name);
  }
}

export const shout = (name: string): string => {
  return greet(name).toUpperCase();
};
