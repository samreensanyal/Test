/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       12 Jun 2015     evan
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * @appliedtorecord recordType
 * 
 * @param {String} type Operation types: create, edit, delete, xedit
 *                      approve, reject, cancel (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF)
 *                      markcomplete (Call, Task)
 *                      reassign (Case)
 *                      editforecast (Opp, Estimate)
 * @returns {Void}
 */
function userEventBeforeSubmit(type){
	if (type == 'delete' || type == 'cancel') return;
	var rtn = true;
	var item = nlapiGetFieldValue('custrecord_sps_cxref_item');
	var customer = nlapiGetFieldValue('custrecord_sps_cxref_customer');
	var bpn = nlapiGetFieldValue('custrecord_sps_cxref_pn0') || false;
	var upc = nlapiGetFieldValue('custrecord_sps_cxref_upc') || false;
	var id = nlapiGetRecordId() || false;
	if (type == 'xedit') {
		var newRec = nlapiGetNewRecord();
		var oldRec = nlapiGetOldRecord();
		customer = newRec.getFieldValue('custrecord_sps_cxref_customer') || oldRec.getFieldValue('custrecord_sps_cxref_customer');
		bpn = newRec.getFieldValue('custrecord_sps_cxref_pn0') || oldRec.getFieldValue('custrecord_sps_cxref_pn0');
		upc = newRec.getFieldValue('custrecord_sps_cxref_upc') || oldRec.getFieldValue('custrecord_sps_cxref_upc');
		
	}
	
	var filterExpression = [['custrecord_sps_cxref_customer', 'is', customer]]; //, 'AND',
	                        //['custrecord_sps_cxref_item', 'is', item]];
	var partArr = [];
	if (bpn) {
		partArr.push(['custrecord_sps_cxref_pn0', 'is', bpn]);
	}
	if (upc) {
		partArr.push(['custrecord_sps_cxref_upc', 'is', upc]);
	}
	var partFilter = [];
	if (partArr.length == 1) partFilter = partArr[0];
	else {
		while (partArr.length>0) {
			if (partFilter.length>0) partFilter.push('OR');
			partFilter.push(partArr.pop());
		}
	}
	
	if (partFilter.length>0) {
		filterExpression.push('AND');
		filterExpression.push(partFilter);
	}

	if (id) {
		filterExpression.push('AND');
		//filterExpression.push('NOT');
		filterExpression.push(['internalid', 'noneof', id]);
	}
	nlapiLogExecution('DEBUG', 'filterExpression', JSON.stringify(filterExpression));
	var results = nlapiSearchRecord('customrecord_sps_cxref', null, filterExpression);
	if (results != null && results.length>0) {
		nlapiLogExecution('DEBUG', results.length, JSON.stringify(results[0]));
		rtn = false;
	}
	
	
	if (!rtn) {
		throw nlapiCreateError('101', 'A cross reference for this item, customer, and bpn combination already exists. Cross Reference has not been saved', true);
	}
}
