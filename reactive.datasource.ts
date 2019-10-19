import {DataSource} from '@angular/cdk/collections';
import {combineLatest, Observable, of, Subject} from 'rxjs';
import {MatPaginator, MatSort} from '@angular/material';
import {filter, map, scan, shareReplay, startWith} from 'rxjs/operators';
import {NgCommonsUtils} from './ng-commons.utils';

export class ReactiveDatasourceFilterBuilder {

  name;
  filterFunction;
  value$;
  active;

  finishFunction;

  constructor(finnishFunction) {
    this.finishFunction = finnishFunction;
  }

  withName(name) {
    this.name = name;
    return this;
  }

  withActiveValue(active: any) {
    this.active = active;
    return this;
  }

  withFilterFunction(func: (value) => (item) => boolean) {
    this.filterFunction = func;
    return this;
  }

  withValueObservable(value$: Observable<any>) {
    this.value$ = value$;
    return this;
  }

  and() {
    return this.finishFunction({
      name: this.name,
      filterFunc: this.filterFunction,
      value$: this.value$,
      active: this.active
    });
  }
}

export class ReactiveDatasourceBuilder {

  private filters = [];
  private items$;
  private initialSorting;
  private sortingDirective;
  private paginator;
  private paginationOptions;

  withFilter() {
    return new ReactiveDatasourceFilterBuilder(
      (filterItem) => {
        this.filters = [...this.filters, filterItem];
        return this;
      }
    );
  }

  withSortingDirective(sortingDirective: MatSort) {
    this.sortingDirective = sortingDirective;
    return this;
  }

  withActiveSorting(initialSorting: { active: string, direction: 'desc' | 'asc' }) {
    this.initialSorting = initialSorting;
    return this;
  }

  withPaginationDirective(paginator: MatPaginator) {
    this.paginator = paginator;
    return this;
  }

  withPaginationOptions(paginationOptions: { pageSize: number, pageSizeOptions: number[] }) {
    this.paginationOptions = paginationOptions;
    return this;
  }

  withItems(items$: Observable<any[]>) {
    this.items$ = items$;
    return this;
  }

  build() {
    if (!this.items$) {
      throw new Error('Initial items should be set in order to use this datasource (.withItems())');
    }
    return new ReactiveDatasource(
      this.items$,
      this.sortingDirective,
      this.initialSorting,
      this.filters,
      this.paginator,
      this.paginationOptions
    );
  }
}

export class ReactiveDatasource extends DataSource<any> {

  readonly filters;
  readonly defaultFilters;
  readonly filtered$: Observable<any[]>;

  private subs = [];
  private dispatcher$: Subject<{ type: string, payload: any }>;
  private items$: Observable<{ items: any[], filters: any[] }>;

  constructor(initialItems$, sortingDirective, initialSorting, filters = [], paginator, paginationOptions) {
    super();

    const sort$ = ReactiveDatasource.initializeSort(sortingDirective, initialSorting);
    const page$ = ReactiveDatasource.initializePage(paginator, paginationOptions);

    this.dispatcher$ = new Subject();

    this.filters = filters
      .map(flt => ({name: flt.name, filterFunc: flt.filterFunc}))
      .map(flt => ({name: flt.name, payloadFunc: (value) => ({name: flt.name, func: flt.filterFunc(value)})}))
      .reduce((state, value) => ({...state, [value.name]: value.payloadFunc}), {});
    this.defaultFilters = filters
      .filter(flt => !!flt.active)
      .map(flt => this.filters[flt.name](flt.active));
    this.items$ = this.dispatcher$
      .pipe(
        scan((state, action) => this.reduce(state, action), {items: [], filters: []}),
        shareReplay()
      );

    const filtered$ = this.items$
      .pipe(
        map(state => ReactiveDatasource.filter(state)),
        shareReplay()
      );

    this.filtered$ = filtered$
      .pipe(
        items$ => combineLatest([items$, sort$]),
        map(([items, sort]) => ReactiveDatasource.sort(sort, items)),
        items$ => combineLatest([items$, page$]),
        map(([items, page]) => ReactiveDatasource.paginate(items, page)),
        shareReplay()
      );

    const sub = initialItems$
      .subscribe(items => this.dispatcher$.next({type: 'SET', payload: items}));
    const sub2 = filtered$
      .pipe(
        filter(() => !!paginator)
      )
      .subscribe(items => {
        paginator.length = items.length;
      });
    const subs = filters
      .map(flt =>
        flt.value$
          .pipe(
            filter(value => value !== undefined),
            map(status => ({type: 'UPDATE_FILTER', payload: this.filters[flt.name](status)}))
          )
          .subscribe(action => this.dispatcher$.next(action))
      );
    this.subs = [...subs, sub, sub2];
  }

  public static builder() {
    return new ReactiveDatasourceBuilder();
  }

  private static sort(sort, items) {
    if (!sort || !sort.active || !sort.direction) {
      return items;
    }
    const ordered = NgCommonsUtils.sort(items).by(sort.active);
    if (sort.direction === 'asc') {
      return ordered;
    } else if (sort.direction === 'desc') {
      return ordered.reverse();
    }
    return items;
  }

  private static filter(state) {
    let filtered = state.items;
    state.filters
      .forEach(f => {
        filtered = filtered.filter(item => f.func(item));
      });
    return filtered;
  }

  private static paginate(items, page) {
    if (!page) {
      return items;
    }
    const start = page.pageIndex * page.pageSize;
    return [...items].splice(start, page.pageSize);
  }

  private static initializeSort(directive: MatSort, initial: { active: string; direction: 'desc' | 'asc' }) {
    if (!directive) {
      return of(null);
    }
    if (initial) {
      directive.active = initial.active;
      directive.direction = initial.direction;
    }
    return directive.sortChange
      .pipe(
        startWith(initial),
        shareReplay()
      );
  }

  private static initializePage(directive: MatPaginator, paginationOptions = {pageSize: 50, pageSizeOptions: [25, 50, 100]}) {
    if (!directive) {
      return of(null);
    }
    directive.pageSize = paginationOptions.pageSize;
    directive.pageSizeOptions = paginationOptions.pageSizeOptions;

    return directive.page
      .pipe(
        startWith({pageSize: directive.pageSize, pageIndex: directive.pageIndex}),
        shareReplay()
      );
  }

  public removeFilter(name) {
    this.dispatcher$.next({type: 'REMOVE_FILTER', payload: name});
  }

  public hasFilter(name: string): Observable<boolean> {
    return this.items$
      .pipe(
        map((items: any) => items.filters.some(f => f.name === name))
      );
  }

  // Override
  public connect(): Observable<any[]> {
    return this.filtered$;
  }

  // Override
  public disconnect() {
    this.subs.forEach(sub => sub.unsubscribe());
  }

  private reduce(state, action): any {
    switch (action.type) {
      case('SET'):
        return {
          items: action.payload,
          filters: this.defaultFilters
        };
      case('UPDATE_FILTER'):
        return {
          ...state,
          filters: [
            ...state.filters.filter(f => f.name !== action.payload.name),
            action.payload
          ]
        };
      case('REMOVE_FILTER'):
        return {
          ...state,
          filters: state.filters
            .filter(f => f.name !== action.payload)
        };
      default:
        return {items: [], filters: []};
    }
  }
}
