import { LogPort } from '../domain/usecases/adapter-interfaces/LogPort';

export class GasLogPort implements LogPort {
  error(message: string): void {
    console.error(message);
  }
}
