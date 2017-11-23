/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       05 Jun 2015     evan
 *
 */

/**
 * Scheduled script for firing off SPS_LIB_Item_Xref.js::matchAllSalesOrderLines
 *
 * Runs matcher on sales orders with custbody_sps_xref_queued set
 *
 * @param {String} type Context Types: scheduled, ondemand, userinterface, aborted, skipped
 */
function scheduled(type) {
	//check for other records waiting for cross references
	var filter = [['custbody_sps_xref_queued', 'is', 'T'], 'AND', ['mainline', 'is', 'T']];
	var columns = [];
	columns.push(new nlobjSearchColumn('custbody_sps_xref_queued'));
	columns.push(new nlobjSearchColumn('custbody_sps_xref_restricted'));

	var searchResult = nlapiSearchRecord('transaction', null, filter, columns) || [];
	nlapiLogExecution('DEBUG', 'Scheduled Status', 'Found ' + searchResult.length + ' items');
	for (var resultIndex=0; resultIndex<searchResult.length; resultIndex++) {
		var salesOrderInternalId = parseInt(searchResult[resultIndex].getId());
		nlapiLogExecution('DEBUG', 'Scheduled Status', 'Found another with internalid '+salesOrderInternalId);

		try {
			var queuedString = searchResult[resultIndex].getValue('custbody_sps_xref_queued');
			var restrictString = searchResult[resultIndex].getValue('custbody_sps_xref_restricted');

			var restriction = null;
			if (restrictString != null && restrictString.trim() != '') {
				restriction = JSON.parse(restrictString);
			}

			var matchResult = matchAllSalesOrderLines(salesOrderInternalId, 10 + 25, restriction);

		} catch(error) {
			nlapiLogExecution('ERROR', 'Scheduled matching failed unsetting queued flag', describeError(error));
			matchResult = MatchAllResult.YIELDED;
			nlapiYieldScript(); // just in case
			nlapiSubmitField('salesorder', salesOrderInternalId, ['custbody_sps_xref_queued', 'custbody_sps_xref_restricted'], ['F', '']);
			//var verify = nlapiLookupField('salesorder', salesOrderInternalId, ['custbody_sps_xref_queued', 'custbody_sps_xref_restricted']);
			//nlapiLogExecution('DEBUG', 'Verify unsetting queued flag', JSON.stringify(verify));
		}

		nlapiLogExecution('DEBUG', 'Scheduled Status', 'Finished with internalid '+salesOrderInternalId);
		if (matchResult == MatchAllResult.YIELDED ||  resultIndex==(searchResult.length-1)) {
			nlapiLogExecution('DEBUG', 'Scheduled Status', 'Searching for others before quitting');
			searchResult = nlapiSearchRecord('transaction', null, filter, columns) || []; // 10
			nlapiLogExecution('DEBUG', 'Scheduled Status', 'Found ' + searchResult.length + ' items');
			resultIndex = -1;
		}
	}
}
