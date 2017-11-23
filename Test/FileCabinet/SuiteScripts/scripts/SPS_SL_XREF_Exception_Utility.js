/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       14 Oct 2014     evan
 *
 */

/**
 * @param {nlobjRequest} request Request object
 * @param {nlobjResponse} response Response object
 * @returns {Void} Any output is written via response object
 */

const START_INDEX_PARAM = 'custom_sps_startindex';

function suitelet(request, response) {
	try {
		if (request.getMethod() == 'GET') {
			var startIndex = parseInt(request.getParameter(START_INDEX_PARAM));
			if(isNaN(startIndex))
				startIndex = 0;

			var form = nlapiCreateForm('Manage Cross Reference Exceptions');
			form.addSubmitButton('Submit');
			var sublist = form.addSubList('custpage_sublist', 'list', 'Exceptions', null);
			sublist.addMarkAllButtons();
			sublist.addField('checkbox', 'checkbox', ' ', null).setDisplayType('normal');
			sublist.addField('customer', 'select', 'Customer', 'customer').setDisplayType('inline');
			sublist.addField('date', 'date', 'Date', null).setDisplayType('inline');
			sublist.addField('sale', 'select', 'Sales Order', 'transaction').setDisplayType('inline');
			sublist.addField('line', 'integer', 'Line', null).setDisplayType('inline');
			sublist.addField('bpn', 'text', 'BPN', null).setDisplayType('inline');
			sublist.addField('vpn', 'text', 'VPN', null).setDisplayType('inline');
			sublist.addField('upc', 'text', 'UPC', null).setDisplayType('inline');
			sublist.addField('ediuom', 'text', 'EDI UOM', null).setDisplayType('inline');
			//var defaultItemId = nlapiGetContext().getSetting('SCRIPT', 'custscript_default_item_exception');
			var defaultItemId = nlapiLookupField('customrecord_sps_cxref_setup', 1, 'custrecord_sps_cxref_default_item') || false;
			if (defaultItemId) {
				let search = nlapiLoadSearch(null, 'customsearch_sps_sales_item_exceptions');
				search.addFilter(new nlobjSearchFilter('internalid', 'item', 'is', defaultItemId));
				let searchResults = search.runSearch();
				let results = searchResults.getResults(startIndex, startIndex + 1000); //10
				for (var i = 1; results != null && i <= results.length; i++) {
					var result = JSON.parse(JSON.stringify(results[i - 1]));
					//if (i<4) nlapiLogExecution('DEBUG','result', JSON.stringify(results[i-1]));
					sublist.setLineItemValue('customer', i, result.columns.entity.internalid);
					sublist.setLineItemValue('date', i, result.columns.trandate);
					sublist.setLineItemValue('sale', i, result.id);
					var lineid = parseInt(result.columns.linesequencenumber);
					sublist.setLineItemValue('line', i, lineid.toFixed(0));
					sublist.setLineItemValue('bpn', i, result.columns.custcol_sps_bpn || '');
					sublist.setLineItemValue('vpn', i, result.columns.custcol_sps_vendorpartnumber || '');
					sublist.setLineItemValue('upc', i, result.columns.custcol_sps_upc || '');
					sublist.setLineItemValue('ediuom', i, result.columns.custcol_sps_orderqtyuom || '');
				}

				if (startIndex > 0) {
					let prevIndex = startIndex - 1000;
					if (prevIndex < 0) {
						prevIndex = 0;
					}
					form.addButton('custpage_sps_prevpage_btn', 'Previous Page', makePaginationOnClick(prevIndex));
				}
				if (results.length >= 1000) {
					let nextIndex = startIndex + 1000;
					form.addButton('custpage_sps_nextpage_btn', 'Next Page', makePaginationOnClick(nextIndex));
				}

				form.addField('custpage_sps_shownitems_label', 'label', 'Showing items ' + (startIndex + 1) + '-' + (startIndex + results.length));

				response.writePage(form);
			} else {
				response.write('Please configure a default Item before attempting to manage exceptions');
			}

		} else {
			var lines = request.getLineItemCount('custpage_sublist');

			var restrictToLinesSet = {};
			var salesOrderCount = 0;
			for (var i = 1; i <= lines; i++) {
				if (request.getLineItemValue('custpage_sublist', 'checkbox', i) == 'T') {
					var salesOrderInternalId = request.getLineItemValue('custpage_sublist', 'sale', i);

					var restrictToLines = [];
					if (restrictToLinesSet.hasOwnProperty(salesOrderInternalId)) {
						restrictToLines = restrictToLinesSet[salesOrderInternalId];
					} else {
						restrictToLinesSet[salesOrderInternalId] = restrictToLines;
						salesOrderCount++;
					}
					//var item = request.getLineItemValue('custpage_sublist', 'sale', i);
					var lineNumber = parseInt(request.getLineItemValue('custpage_sublist', 'line', i));
					restrictToLines.push(lineNumber);
					restrictToLines.sort();
				}
			}
			var schedule = false;
			for (var salesOrderInternalId in restrictToLinesSet) {
				if (restrictToLinesSet.hasOwnProperty(salesOrderInternalId)) {
					var restrictToLines = restrictToLinesSet[salesOrderInternalId];
					var restrictions = {lines: restrictToLines};
					if (schedule) {
						scheduleMatchAllSalesOrderLines(salesOrderInternalId, restrictions, true); // 20
					} else {
						var matchResult = matchAllSalesOrderLines(salesOrderInternalId, salesOrderCount * 20, restrictions);
						salesOrderCount--;
						if (matchResult == MatchAllResult.SCHEDULED) {
							schedule = true;
						}
					}
				}
			}
			response.sendRedirect('suitelet', nlapiGetContext().getScriptId(), nlapiGetContext().getDeploymentId());
		}
	} catch (err) {
		nlapiLogExecution('ERROR', 'XREF_EXCEPTION_UTILITY', err);
		response.write('An error has occurred<br><pre>' + err + '</pre>');
	}
}

function makePaginationOnClick(startIndex) {
	return "window.location='" + nlapiResolveURL('SUITELET', 'customscript_sps_sl_xref_exception_util', 'customdeploy_sps_sl_xref_exception_util') + '&' + START_INDEX_PARAM + '=' + startIndex + "';";
}

module.exports.suitelet = function(request, response) { suitelet(request, response); };