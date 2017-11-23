
/**
 * @readonly
 * @enum {string}
 */
var MatchAllResult = {
    INLINE: "INLINE",
    YIELDED: "YIELDED",
    SCHEDULED: "SCHEDULED"
};

/**
 *
 * @param {string} salesOrderInternalId
 * @param {int} reserveUsage
 * @param {MatchRestrictions} [restrictions] limits on what to match and how
 *
 * @returns {MatchAllResult}
 */
function matchAllSalesOrderLines(salesOrderInternalId, reserveUsage, restrictions) {
    if(restrictions == null) {
        restrictions = {}
    }

    var restrictLines = restrictions.lines || null;
    var startLine = restrictions.start || 1;
    var saveAfter = restrictions.saveAfter || 1000;

    if(reserveUsage == undefined) {
        reserveUsage = 0;
    }

    var lineNumber = startLine - 1; // start one below minimum lineNumber so it can be incremented once

    var cachedValues = createCachedValues(salesOrderInternalId); // initialize so first call to getLineItemCount succeeds

    var lineCount = cachedValues.salesOrderRecord.getLineItemCount('item');
    var offset = 0;

    var next = function() {
        var newLineCount = cachedValues.salesOrderRecord.getLineItemCount('item');
        offset = Math.max(0, newLineCount - lineCount);
        if(offset > 0) {
            nlapiLogExecution('DEBUG', 'Detected group item, advancing line number', JSON.stringify({offset:offset}));
            lineCount = newLineCount;
            if(restrictLines != null) {
                for(let i = 0; i < restrictLines.length; i++) {
                    restrictLines[i] += offset;
                }
            } else {
                lineNumber += offset;
            }
        }
        if(restrictLines != null) {
            lineNumber = restrictLines.shift();
            return lineNumber != undefined; // shift returns undefined when there are no remaining elements
        } else {
            lineNumber++;
            return lineNumber <= lineCount;
        }
    };

    var yielded = false;
    var attemptedMatch = false;
    var matchedPrev = (cachedValues == null) ? 0 : cachedValues.processed.matched.length;

    var retryCount = 0;

    while(next()) {
        var context = nlapiGetContext();
        var remaining = context.getRemainingUsage();
        var required = 65+35+40+reserveUsage;
        var matched = (cachedValues == null) ? 0 : cachedValues.processed.matched.length;
        nlapiLogExecution('DEBUG', 'Governance Check', 'In ' + context.getExecutionContext() + ' script require ' + required + ' remaining ' + remaining);
        if ((remaining < required) || saveAfter < (matched - matchedPrev) || offset > 0) {
            try {
                nlapiSubmitRecord(cachedValues.salesOrderRecord, true, true); //20
                retryCount = 0;
            } catch(error) {
                nlapiLogExecution('ERROR', "Failed to save sales order partial match " + salesOrderInternalId, describeError(error));
                if(error instanceof nlobjError && error.getCode() == 'RCRD_HAS_BEEN_CHANGED') {
                    retryCount++;
                    nlapiLogExecution('ERROR', "Concurrent change " + salesOrderInternalId + " retry " + retryCount, describeError(error));
                    if(retryCount <= 5) {
                        if (restrictLines != null) {
                            restrictLines.unshift(lineNumber);
                        } else {
                            lineNumber--;
                        }
                    }
                }
            }
            cachedValues = null;
            if(context.getExecutionContext() == 'scheduled') {
                yielded = true;
                nlapiYieldScript();
            } else {
                if(restrictLines != null) {
                    restrictLines.unshift(lineNumber); // put back the line number we took for scheduling
                    restrictions = {lines: restrictLines};
                } else {
                    restrictions = {start: lineNumber};
                }
                scheduleMatchAllSalesOrderLines(salesOrderInternalId, restrictions); // 40
                return MatchAllResult.SCHEDULED;
            }
        }
        matchedPrev = matched;
        attemptedMatch = true;
        cachedValues = matchSalesOrderLine(salesOrderInternalId, lineNumber, cachedValues);
    }

    if(attemptedMatch && cachedValues != null) {
        finishMatching(salesOrderInternalId, cachedValues, restrictions); // 35
    }

    if(yielded) {
        return MatchAllResult.YIELDED;
    } else {
        return MatchAllResult.INLINE;
    }
}

/**
 *
 * @param error something caught in a try/catch
 * @returns {string} Text suitable for printing to a log
 */
function describeError(error) {
    if(error instanceof Error) {
        return "Error: " + error.message;
    } else if(error instanceof nlobjError) {
        var trace = error.getStackTrace();
        var stack = "";
        if(trace != null)
        for(var i=0; i<trace.length; i++) {
            stack += trace[i] + "\n"
        }
        return "nlobjError: " + error.getCode() + ": " + error.getDetails() + "\n" + stack;
    } else if(error != null) {
        return JSON.stringify(error);
    } else {
        return "Unknown"
    }
}

/**
 * cost 35
 * @param {string} salesOrderInternalId
 * @param {XrefDynamicValues} cachedValues
 * @param {MatchRestrictions} restrictions
 */
function finishMatching(salesOrderInternalId, cachedValues, restrictions) {
    try {
        cachedValues.salesOrderRecord.setFieldValue('custbody_sps_xref_queued', 'F');
        cachedValues.salesOrderRecord.setFieldValue('custbody_sps_xref_restricted', '');
        var possiblyModified = cachedValues.salesOrderRecord.getFieldValue('shipcarrier') || null;
        if(cachedValues.salesOrderRecord.shipcarrier != possiblyModified) {
            nlapiLogExecution('DEBUG', 'Shipcarrier was [' + cachedValues.salesOrderRecord.shipcarrier + '] now is [' + possiblyModified + "]");
            cachedValues.salesOrderRecord.setFieldValue('shipcarrier', cachedValues.salesOrderRecord.shipcarrier);
        }
        nlapiSubmitRecord(cachedValues.salesOrderRecord, true, true); // 20
        //var newNote = nlapiCreateRecord('note'); // 5
        //newNote.setFieldValue('author', nlapiGetUser());
        //newNote.setFieldValue('transaction', salesOrderInternalId);
        //newNote.setFieldValue('title', 'Item Cross Reference Activity');
        var matched = cachedValues.processed.matched.length;
        var failed = cachedValues.processed.failed.length;
        var noteStr = 'Attempted to match on ' + (matched + failed) + ' items total. Found matches for ' + matched + ' items.';
        if (failed == 1) {
            noteStr += ' Unable to find a match on line ' + cachedValues.processed.failed[0];
        }
        else if (failed > 1) {
            noteStr += ' Unable to find matches on lines ' + cachedValues.processed.failed.join(',');
        }
        nlapiLogExecution('AUDIT', 'Saved sales order ' + salesOrderInternalId, noteStr);
        //newNote.setFieldValue('note', noteStr);
        //nlapiSubmitRecord(newNote); // 10
    } catch (error) {
        var details = "Caused by: " + describeError(error);
        if(cachedValues != null && cachedValues.processed != null) {
            details += "\nProcessed:"+JSON.stringify(cachedValues.processed, null, "  ");
        }
        nlapiLogExecution('ERROR', "Failed to save sales order after matching " + salesOrderInternalId, details);
        if(error instanceof nlobjError && error.getCode() == 'RCRD_HAS_BEEN_CHANGED' && cachedValues.processed.matched.length > 0) {
            var saveAfter = restrictions.saveAfter || 1000;
            if(saveAfter > 100) {
                saveAfter = 100;
            } else if(saveAfter > 10) {
                saveAfter = 10;
            } else if(saveAfter > 1) {
                saveAfter = 1;
            }
            restrictions.saveAfter = saveAfter;
            scheduleMatchAllSalesOrderLines(salesOrderInternalId, restrictions); // 40
        } else {
            nlapiSubmitField('salesorder', salesOrderInternalId, ['custbody_sps_xref_queued', 'custbody_sps_xref_restricted'], ['F', '']);
        }
    }
}

/**
 * cost 20 + 20?
 * maximum cost 40
 *
 * @param salesOrderInternalId
 * @param restrictions
 * @param {boolean} [alreadyScheduled=false]
 */
function scheduleMatchAllSalesOrderLines(salesOrderInternalId, restrictions, alreadyScheduled) {
    nlapiLogExecution('DEBUG','1.1',salesOrderInternalId+': Sending large record to scheduled queue');
    nlapiSubmitField('salesorder', salesOrderInternalId, 'custbody_sps_xref_queued', 'T', false); // 10
    nlapiSubmitField('salesorder', salesOrderInternalId, 'custbody_sps_xref_restricted', JSON.stringify(restrictions), false); // 10
    if(!alreadyScheduled) {
        var scheduleResult = nlapiScheduleScript('customscript_sps_ss_item_matcher', 'customdeploy_sps_ss_item_matcher', {}); // 20
        if (scheduleResult !== 'QUEUED') {
            nlapiLogExecution('ERROR', '1.2', salesOrderInternalId + ': Scheduled queue returns ' + queue + '. Record marked for inclusion');
        }
    }
}

/**
 * @typedef {Object} MatchRestrictions
 *
 * @property {int[]} lines only operate on the following lines
 * @property {int} start only operate on this line and the following lines
 * @property {boolean} saveEveryLine save after every line match
 */

/**
 * Values that cannot be hard coded constants, but nonetheless do not change from line to line on
 * a sales order, so we do not want to look them up each time.
 *
 * @typedef {Object} XrefDynamicValues
 *
 * @property {nlobjRecord} salesOrderRecord salesorder
 * @property {string} shipcarrier value saved to reset on salesorder to set back before saving like the old  SPS_Item_Match.js code did
 * @property {boolean} acceptTPPrice (salesorder.entity as customer).custentity_sps_tp_price_accept == 'T'
 * @property {boolean} acceptUOM (salesorder.entity as customer).custentity_sps_accept_tp_uom == 'T'
 * @property {string} defaultItemId customrecord_sps_cxref_setup.custrecord_sps_cxref_default_item
 *
 * @property {object} processed
 * @property {number[]} processed.matched
 * @property {number[]} processed.failed
 * @property {number[]} processed.skipped
 */

/**
 *
 * @param {string} salesOrderInternalId
 *
 * @return {XrefDynamicValues}
 */
function createCachedValues(salesOrderInternalId) {
    var cachedValues = {};
    cachedValues.salesOrderRecord = nlapiLoadRecord('salesorder', salesOrderInternalId, {recordmode: 'dynamic'}); //10
    cachedValues.shipcarrier = cachedValues.salesOrderRecord.getFieldValue('shipcarrier') || null; // prevent undefined from getting through
    var customer = cachedValues.salesOrderRecord.getFieldValue('entity');
    cachedValues.acceptTPPrice = nlapiLookupField('customer', customer, 'custentity_sps_tp_price_accept') == 'T'; //5
    cachedValues.acceptUOM = nlapiLookupField('customer', customer, 'custentity_sps_accept_tp_uom') == 'T'; //5
    //TODO cheaper to do a LoadRecord on the customer and get the two fields (5+5) vs (5)
    cachedValues.defaultItemId = nlapiLookupField('customrecord_sps_cxref_setup',1,'custrecord_sps_cxref_default_item') || ''; // 5

    cachedValues.processed = {
        matched: [],
        failed: [],
        skipped: []
    };

    return cachedValues;
}

/**
 * Attempt to match a single line of a SalesOrder.
 * If item is currently the default item, a series of searches are performed to find an appropriate item.
 * If one is found, it is set on this line, otherwise an Error is thrown
 * If a valid item is already set, the function returns with no error.
 *
 * cost is 25? + (1-4)*10
 * maximum cost 65
 *
 * @param {string} salesOrderInternalId
 * @param {int} lineNumber
 * @param {XrefDynamicValues} [cachedValues]
 * @returns {XrefDynamicValues} cachedValues if not null, or a new set of values suitable to be passed in to a subsequent call
 */
function matchSalesOrderLine(salesOrderInternalId, lineNumber, cachedValues) {
    try {
        if(cachedValues == null) {
            cachedValues = createCachedValues(salesOrderInternalId); //25
        }

        var itemId = cachedValues.salesOrderRecord.getLineItemValue('item', 'item', lineNumber);

        if (cachedValues.defaultItemId != itemId) {
            // this record needs no processing
            cachedValues.processed.skipped.push(lineNumber);
        } else {
            _internal_matchSalesOrderLine(salesOrderInternalId, lineNumber, cachedValues); // (1-4)*10
            cachedValues.processed.matched.push(lineNumber);
        }
    } catch(error) {
        cachedValues.processed.failed.push(lineNumber);
        nlapiLogExecution('ERROR', "Failed to match sales order " + salesOrderInternalId + " line number " + lineNumber, "Caused by: " + describeError(error));
        if(error instanceof nlobjError && error.getCode() == 'SSS_USAGE_LIMIT_EXCEEDED') {
            // The calling funtion should ensure there is enough usage points left to
            // both allow this function to finish and do any necessary cleanup before yeilding or scheduling
            // this check exists merely to prevent runaway code from never stopping
            var context = nlapiGetContext();
            nlapiLogExecution('ERROR', 'Governance Check', 'In ' + context.getExecutionContext() + ' script remaining ' + context.getRemainingUsage());
            throw error;
        }
    }
    return cachedValues;
}


function logEachResult(logLevel, prefix, resultArray) {
    for (var i = 0; resultArray != null && i < resultArray.length; i++) {
        var result = resultArray[i];
        nlapiLogExecution(logLevel, prefix+(i+1), JSON.stringify(result));
    }
}

var searchXrefFilters = [
    {
        description: 'UPC Xref',
        searchItemType: 'customrecord_sps_cxref',
        filterExpression: function(salesOrderRecord, lineNumber) {
            var upc = salesOrderRecord.getLineItemValue('item','custcol_sps_upc', lineNumber) || '';
            var customer = salesOrderRecord.getFieldValue('entity');
            return [new nlobjSearchFilter('custrecord_sps_cxref_upc', null, 'is', upc),
                new nlobjSearchFilter('isinactive', null, 'is', 'F'),
                new nlobjSearchFilter('isinactive', 'custrecord_sps_cxref_item', 'is', 'F', null),
                new nlobjSearchFilter('custrecord_sps_cxref_upc', null, 'isnotempty', null),
                new nlobjSearchFilter('custrecord_sps_cxref_customer', null, 'anyof', ['@NONE@',customer])];
        }
    },
    {
        description: 'BPN Xref',
        searchItemType: 'customrecord_sps_cxref',
        filterExpression: function(salesOrderRecord, lineNumber) {
            var bpn = salesOrderRecord.getLineItemValue('item','custcol_sps_bpn', lineNumber) || '';
            var customer = salesOrderRecord.getFieldValue('entity');
            return [ new nlobjSearchFilter('custrecord_sps_cxref_pn0', null, 'is', bpn),
                new nlobjSearchFilter('isinactive', null, 'is', 'F'),
                new nlobjSearchFilter('isinactive', 'custrecord_sps_cxref_item', 'is', 'F', null),
                new nlobjSearchFilter('custrecord_sps_cxref_pn0', null, 'isnotempty', null),
                new nlobjSearchFilter('custrecord_sps_cxref_customer', null, 'anyof', ['@NONE@',customer])];
        }
    },
    {
        description: 'Native Item Name/ID',
        searchItemType: 'item',
        filterExpression: function(salesOrderRecord, lineNumber) {
            var vpn = salesOrderRecord.getLineItemValue('item','custcol_sps_vendorpartnumber', lineNumber) || '';
            return [
                ['isinactive', 'is', 'F'], 'AND',
                [ "formulatext: CASE WHEN INSTR({itemid},' : ')>0 THEN SUBSTR(REGEXP_SUBSTR({itemid},' : .+$',INSTR({itemid},' : ',-1,1),1,'n'),4) ELSE {itemid} END", "is", vpn]];
        }
    },
    {
        description: 'Native UPC',
        searchItemType: 'item',
        filterExpression: function(salesOrderRecord, lineNumber) {
            var upc = salesOrderRecord.getLineItemValue('item','custcol_sps_upc', lineNumber) || '';
            return [
                ['isinactive', 'is', 'F'], 'AND',
                [ 'upccode', 'is', upc], 'AND', ['upccode', 'isnotempty', null]];
        }
    }
];

/**
 * Attempt to match a single line of a SalesOrder.
 * If item is currently the default item, a series of searches are performed to find an appropriate item.
 * If one is found, it is set on this line, otherwise an Error is thrown
 * If a valid item is already set, the function returns with no error.
 *
 * cost is (1-4)*10
 * maximum cost 40
 *
 * @param salesOrderInternalId
 * @param lineNumber
 * @param {XrefDynamicValues} cachedValues
 * @returns {*[]}
 */
function _internal_matchSalesOrderLine(salesOrderInternalId, lineNumber, cachedValues) {

    // short cut to not have most lines get uselessly long
    var salesOrderRecord = cachedValues.salesOrderRecord;

    var item = salesOrderRecord.getLineItemValue('item','item',lineNumber);
    var itemType = salesOrderRecord.getLineItemValue('item','itemsubtype',lineNumber);

    nlapiLogExecution('DEBUG', 'Starting match on SO internalid: '+ salesOrderInternalId + ' line number ' + lineNumber, JSON.stringify({item:item, itemType: itemType}));

    var qty = salesOrderRecord.getLineItemValue('item','quantity', lineNumber);
    var rate = salesOrderRecord.getLineItemValue('item','rate', lineNumber);
    var amt = salesOrderRecord.getLineItemValue('item','amount', lineNumber);
    var uom = salesOrderRecord.getLineItemValue('item','units', lineNumber);
    var desc = salesOrderRecord.getLineItemValue('item','description', lineNumber) || null;
    var taxCode = salesOrderRecord.getLineItemValue('item','taxcode', lineNumber);

    var tpPrice = salesOrderRecord.getLineItemValue('item','custcol_sps_purchaseprice', lineNumber);

    var poLine = salesOrderRecord.getLineItemValue('item','custcol_sps_linesequencenumber', lineNumber);

    var ediuom = salesOrderRecord.getLineItemValue('item','custcol_sps_orderqtyuom', lineNumber) || null;


    //run search(es) to match part number
    var outgoingItemId = null;

    for(var searchNum=0; searchNum < searchXrefFilters.length; searchNum++) { // 1-4 iterations
        var search = searchXrefFilters[searchNum];
        var filterExpression = search.filterExpression(salesOrderRecord, lineNumber);

        nlapiLogExecution('DEBUG', 'Starting search attempt '+(searchNum+1)+' on SO internalid: '+ salesOrderInternalId + ' line number ' + lineNumber, filterExpression);
        var results = nlapiSearchRecord(search.searchItemType, null, filterExpression, null); //10
        if (results != null && results.length == 1) {
            nlapiLogExecution('DEBUG', '2.'+(searchNum+1), 'Found 1 match by UPC Xref');
            var xrefId = results[0].getId();
            if('customrecord_sps_cxref' === search.searchItemType) {
                xrefId = nlapiLookupField('customrecord_sps_cxref', xrefId, 'custrecord_sps_cxref_item');
            }
            outgoingItemId = xrefId;
            break;
        } else {
            logEachResult('DEBUG', '2.'+(searchNum+1)+(searchNum+1), results);
        }
    }

    if(outgoingItemId == null) {
        throw new Error("No xref searches succeeded.");
    }

    nlapiLogExecution('DEBUG','3','Setting line '+lineNumber+' with replacement '+outgoingItemId+' , Qty '+qty);
    salesOrderRecord.selectLineItem('item', lineNumber);
    salesOrderRecord.setCurrentLineItemValue('item', 'item', outgoingItemId);
    if (desc == null || desc == '') {
        desc = nlapiLookupField('item', outgoingItemId, 'salesdescription') || null;
    }
    var uomLabel = salesOrderRecord.getLineItemText('item', 'units', lineNumber) || null;
    if (cachedValues.acceptUOM && ediuom != null && uomLabel != ediuom) {
        nlapiLogExecution('DEBUG', 'UOM matching subroutine: [uomLabel, ediuom]', [uomLabel, ediuom]);
        var unitTypeId = nlapiLookupField('item', outgoingItemId, 'unitstype') || false;
        if (unitTypeId) {
            nlapiLogExecution('DEBUG', 'Loading Units Type '+unitTypeId, 'Loading Units Type '+unitTypeId);
            var unitType = nlapiLoadRecord('unitstype', unitTypeId);
            nlapiLogExecution('DEBUG', 'Loaded Units Type '+unitTypeId, 'Loaded Units Type '+unitTypeId);
            for (var k=1; k<=unitType.getLineItemCount('uom'); k++) {
                var abbrev = unitType.getLineItemValue('uom','abbreviation',k).toUpperCase();
                var plAbbrev = unitType.getLineItemValue('uom','pluralabbreviation',k).toUpperCase();
                var uomId = unitType.getLineItemValue('uom','internalid',k);
                if (ediuom.toUpperCase() == abbrev || ediuom.toUpperCase() == plAbbrev) {
                    uom = uomId.toString();
                    nlapiLogExecution('DEBUG', 'Found Unit Match', [abbrev,plAbbrev]);
                    break;
                }
            }
        }
    }

    if(cachedValues.acceptUOM) {
        salesOrderRecord.setCurrentLineItemValue('item', 'units', uom);
    }

    if(cachedValues.acceptTPPrice && tpPrice != null && tpPrice != '') {
        salesOrderRecord.setCurrentLineItemValue('item', 'price', -1); // MANUAL if tpPrice
        salesOrderRecord.setCurrentLineItemValue('item', 'rate', tpPrice); // MANUAL
    }

    //if (cachedValues.acceptTPPrice) {
    //    salesOrderRecord.setCurrentLineItemValue('item', 'quantity', qty);
    //    salesOrderRecord.setCurrentLineItemValue('item', 'units', uom);
    //    salesOrderRecord.setCurrentLineItemValue('item', 'description', desc);
    //    salesOrderRecord.setCurrentLineItemValue('item', 'price', -1);
    //    if (tpPrice != null && tpPrice != '') {
    //        nlapiLogExecution('DEBUG','line, tpPrice',[lineNumber,tpPrice]);
    //        salesOrderRecord.setCurrentLineItemValue('item', 'rate', tpPrice);
    //    }else {
    //        salesOrderRecord.setCurrentLineItemValue('item', 'rate', rate);
    //    }
    //    salesOrderRecord.setCurrentLineItemValue('item', 'amount', amt);
    //    salesOrderRecord.setCurrentLineItemValue('item', 'taxcode', taxCode);
    //}else {
    //    salesOrderRecord.setCurrentLineItemValue('item', 'quantity', qty);
    //    salesOrderRecord.setCurrentLineItemValue('item', 'description', desc);
    //    salesOrderRecord.setCurrentLineItemValue('item', 'taxcode', taxCode);
    //
    //}
    salesOrderRecord.commitLineItem('item');
}

module.exports.matchAllSalesOrderLines = matchAllSalesOrderLines;
module.exports.matchSalesOrderLine = matchSalesOrderLine;
module.exports.scheduleMatchAllSalesOrderLines = scheduleMatchAllSalesOrderLines;
module.exports.describeError = describeError;
module.exports.MatchAllResult = MatchAllResult;