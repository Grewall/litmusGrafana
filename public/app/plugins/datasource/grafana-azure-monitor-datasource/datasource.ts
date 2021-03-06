import _ from 'lodash';
import AzureMonitorDatasource from './azure_monitor/azure_monitor_datasource';
import AppInsightsDatasource from './app_insights/app_insights_datasource';
import AzureLogAnalyticsDatasource from './azure_log_analytics/azure_log_analytics_datasource';
import { AzureMonitorQuery, AzureDataSourceJsonData } from './types';
import {
  DataSourceApi,
  DataQueryRequest,
  DataSourceInstanceSettings,
  DataQueryResponse,
  DataQueryResponseData,
} from '@grafana/data';
import { Observable } from 'rxjs';

export default class Datasource extends DataSourceApi<AzureMonitorQuery, AzureDataSourceJsonData> {
  azureMonitorDatasource: AzureMonitorDatasource;
  appInsightsDatasource: AppInsightsDatasource;
  azureLogAnalyticsDatasource: AzureLogAnalyticsDatasource;

  constructor(instanceSettings: DataSourceInstanceSettings<AzureDataSourceJsonData>) {
    super(instanceSettings);
    this.azureMonitorDatasource = new AzureMonitorDatasource(instanceSettings);
    this.appInsightsDatasource = new AppInsightsDatasource(instanceSettings);
    this.azureLogAnalyticsDatasource = new AzureLogAnalyticsDatasource(instanceSettings);
  }

  query(options: DataQueryRequest<AzureMonitorQuery>): Promise<DataQueryResponse> | Observable<DataQueryResponseData> {
    const promises: any[] = [];
    const azureMonitorOptions = _.cloneDeep(options);
    const appInsightsOptions = _.cloneDeep(options);
    const azureLogAnalyticsOptions = _.cloneDeep(options);

    azureMonitorOptions.targets = _.filter(azureMonitorOptions.targets, ['queryType', 'Azure Monitor']);
    appInsightsOptions.targets = _.filter(appInsightsOptions.targets, ['queryType', 'Application Insights']);
    azureLogAnalyticsOptions.targets = _.filter(azureLogAnalyticsOptions.targets, ['queryType', 'Azure Log Analytics']);

    if (appInsightsOptions.targets.length > 0) {
      const aiPromise = this.appInsightsDatasource.query(appInsightsOptions);
      if (aiPromise) {
        promises.push(aiPromise);
      }
    }

    if (azureLogAnalyticsOptions.targets.length > 0) {
      const obs = this.azureLogAnalyticsDatasource.query(azureLogAnalyticsOptions);
      if (!promises.length) {
        return obs; // return the observable directly
      }
      // NOTE: this only includes the data!
      // When all three query types are ready to be observale, they should all use observable
      promises.push(obs.toPromise().then(r => r.data));
    }

    if (azureMonitorOptions.targets.length > 0) {
      const obs = this.azureMonitorDatasource.query(azureMonitorOptions);
      if (!promises.length) {
        return obs; // return the observable directly
      }
      // NOTE: this only includes the data!
      // When all three query types are ready to be observale, they should all use observable
      promises.push(obs.toPromise().then(r => r.data));
    }

    if (promises.length === 0) {
      return Promise.resolve({ data: [] });
    }

    return Promise.all(promises).then(results => {
      return { data: _.flatten(results) };
    });
  }

  async annotationQuery(options: any) {
    return this.azureLogAnalyticsDatasource.annotationQuery(options);
  }

  async metricFindQuery(query: string) {
    if (!query) {
      return Promise.resolve([]);
    }

    const aiResult = this.appInsightsDatasource.metricFindQuery(query);
    if (aiResult) {
      return aiResult;
    }

    const amResult = this.azureMonitorDatasource.metricFindQuery(query);
    if (amResult) {
      return amResult;
    }

    const alaResult = this.azureLogAnalyticsDatasource.metricFindQuery(query);
    if (alaResult) {
      return alaResult;
    }

    return Promise.resolve([]);
  }

  async testDatasource() {
    const promises: any[] = [];

    if (this.azureMonitorDatasource.isConfigured()) {
      promises.push(this.azureMonitorDatasource.testDatasource());
    }

    if (this.appInsightsDatasource.isConfigured()) {
      promises.push(this.appInsightsDatasource.testDatasource());
    }

    if (this.azureLogAnalyticsDatasource.isConfigured()) {
      promises.push(this.azureLogAnalyticsDatasource.testDatasource());
    }

    if (promises.length === 0) {
      return {
        status: 'error',
        message: `Nothing configured. At least one of the API's must be configured.`,
        title: 'Error',
      };
    }

    return Promise.all(promises).then(results => {
      let status = 'success';
      let message = '';

      for (let i = 0; i < results.length; i++) {
        if (results[i].status !== 'success') {
          status = results[i].status;
        }
        message += `${i + 1}. ${results[i].message} `;
      }

      return {
        status: status,
        message: message,
        title: _.upperFirst(status),
      };
    });
  }

  /* Azure Monitor REST API methods */
  getResourceGroups(subscriptionId: string) {
    return this.azureMonitorDatasource.getResourceGroups(subscriptionId);
  }

  getMetricDefinitions(subscriptionId: string, resourceGroup: string) {
    return this.azureMonitorDatasource.getMetricDefinitions(subscriptionId, resourceGroup);
  }

  getResourceNames(subscriptionId: string, resourceGroup: string, metricDefinition: string) {
    return this.azureMonitorDatasource.getResourceNames(subscriptionId, resourceGroup, metricDefinition);
  }

  getMetricNames(
    subscriptionId: string,
    resourceGroup: string,
    metricDefinition: string,
    resourceName: string,
    metricNamespace: string
  ) {
    return this.azureMonitorDatasource.getMetricNames(
      subscriptionId,
      resourceGroup,
      metricDefinition,
      resourceName,
      metricNamespace
    );
  }

  getMetricNamespaces(subscriptionId: string, resourceGroup: string, metricDefinition: string, resourceName: string) {
    return this.azureMonitorDatasource.getMetricNamespaces(
      subscriptionId,
      resourceGroup,
      metricDefinition,
      resourceName
    );
  }

  getMetricMetadata(
    subscriptionId: string,
    resourceGroup: string,
    metricDefinition: string,
    resourceName: string,
    metricNamespace: string,
    metricName: string
  ) {
    return this.azureMonitorDatasource.getMetricMetadata(
      subscriptionId,
      resourceGroup,
      metricDefinition,
      resourceName,
      metricNamespace,
      metricName
    );
  }

  /* Application Insights API method */
  getAppInsightsMetricNames() {
    return this.appInsightsDatasource.getMetricNames();
  }

  getAppInsightsMetricMetadata(metricName: string) {
    return this.appInsightsDatasource.getMetricMetadata(metricName);
  }

  getAppInsightsColumns(refId: string | number) {
    return this.appInsightsDatasource.logAnalyticsColumns[refId];
  }

  /*Azure Log Analytics */
  getAzureLogAnalyticsWorkspaces(subscriptionId: string) {
    return this.azureLogAnalyticsDatasource.getWorkspaces(subscriptionId);
  }

  getSubscriptions() {
    return this.azureMonitorDatasource.getSubscriptions();
  }
}
