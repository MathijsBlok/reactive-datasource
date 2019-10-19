# reactive-datasource

Angular cdk/material datasource for tables with builder.

````
@ViewChild(MatSort, {static: true}) sort: MatSort;
@ViewChild(MatPaginator, {static: true}) paginator: MatPaginator;


this.dataSource = ReactiveDatasource.builder()
      .withItems(this.buildInitialItems())
      .withActiveSorting({active: 'created', direction: 'desc'})
      .withSortingDirective(this.sort)
      .withPaginationDirective(this.paginator)
      .withFilter()
        .withName('statusFilter')
        .withFilterFunction((status) => (item) => status === 'ALL' || item.status === status)
        .withValueObservable(this.statusGroup.valueChange)
        .withActiveValue('NEW')
        .and()
      .withFilter()
        .withName('clientFilter')
        .withFilterFunction((client) => (item) => client === 'ALL' || item.client.id === client)
        .withValueObservable(this.route.queryParams
            .pipe(
              filter(params => Object.keys(params).some(key => key === 'client')),
              map(params => +params.client),
              filter(client => client === 0 || !!client)
            )
        )
        .and()
      .withFilter()
        .withName('assignedFilter')
        .withFilterFunction((assigned) => (item) => assigned === 'ALL' || !!item.assignee === assigned)
        .withValueObservable(this.assignedGroup.valueChange)
        .and()
      .build();
````
