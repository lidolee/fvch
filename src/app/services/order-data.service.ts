import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class OrderDataService {
  private totalFlyersSource = new BehaviorSubject<number>(0);
  totalFlyersCount$ = this.totalFlyersSource.asObservable();

  constructor() { }

  updateTotalFlyersCount(count: number) {
    this.totalFlyersSource.next(count);
  }

  getCurrentTotalFlyersCount(): number {
    return this.totalFlyersSource.getValue();
  }
}
