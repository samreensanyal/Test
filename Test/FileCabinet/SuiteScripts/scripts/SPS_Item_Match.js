/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       24 Jul 2014     evan
 * 
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

}

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * @appliedtorecord recordType
 * 
 * @param {String} type Operation types: create, edit, delete, xedit,
 *                      approve, cancel, reject (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF only)
 *                      dropship, specialorder, orderitems (PO only) 
 *                      paybills (vendor payments)
 * @returns {Void}
 */
function userEventAfterSubmit(type){
	var id = nlapiGetRecordId();
	
	try {
		var recType = nlapiGetRecordType();
		nlapiLogExecution('DEBUG','1',type+': Starting with '+recType);
		//filter triggers by record type and edit type
		if ((type == 'create') && recType == 'salesorder') {
			var matchResult = matchAllSalesOrderLines(id);

			if(matchResult == MatchAllResult.SCHEDULED) {
				// alert user that script was scheduled?
			}
		}
	}catch(err) {
		nlapiLogExecution('ERROR','userEventAfterSumbit',err);
		
	}
}
