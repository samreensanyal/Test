/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       07 Nov 2014     evan
 *
 */

/**
 * @param {nlobjPortlet} portletObj Current portlet object
 * @param {Number} column Column position index: 1 = left, 2 = middle, 3 = right
 * @returns {Void}
 */



function links(portletObj, column) {
	portletObj.setTitle('Cross References');
	//portletObj.addLine('<br>',null,1);
	var searchlink = nlapiResolveURL('TASKLINK','LIST_SEARCHRESULTS');

	portletObj.addLine('Item Cross References',searchlink+'?searchid='+'customsearch_sps_xref_list_view',1);
	/*
	templateID = nlapiSearchRecord('SavedSearch',null,new nlobjSearchFilter('title', null, 'is', 'SPS UOM Cross References - Default View'),null);
	if (templateID != null) {
		portletObj.addLine('UOM Cross References',searchlink+'?searchid='+templateID[0].getId(),1);
		//portletObj.addLine('<br>',null,1);
	}
	*/
	var manageLink = nlapiResolveURL('SUITELET','customscript_sps_sl_xref_exception_util','customdeploy_sps_sl_xref_exception_util');
	templateID = nlapiSearchRecord('SavedSearch',null,new nlobjSearchFilter('title', null, 'is', 'Item Cross Reference Exceptions'),null);
	if (templateID != null) {
		portletObj.addLine('Manage Cross Reference Exceptions',manageLink,1);
		//manageLink = searchlink+'?searchid='+templateID[0].getId();
		//portletObj.addLine('<br>',null,1);
	}
	//portletObj.addLine('<br>',null,1);
	
	portletObj.addLine('Configure Settings',nlapiResolveURL('record','customrecord_sps_cxref_setup',1),1);
	
	
}

function audit(portlet, column) {
	var manageLink = null;
	var defaultitem = nlapiLookupField('customrecord_sps_cxref_setup',1,'custrecord_sps_cxref_default_item') || false; 
	var searchlink = nlapiResolveURL('SUITELET','customscript_sps_sl_xref_exception_util','customdeploy_sps_sl_xref_exception_util');
    portlet.setTitle('Order Exceptions');
    portlet.addColumn('trandate','date', 'Date', 'LEFT');
    portlet.addColumn('entity','text', 'Customer', 'LEFT');
    portlet.addColumn('statusref','text', 'Status', 'LEFT');
    portlet.addColumn('tranid','text', 'Sales Order', 'LEFT');
    portlet.addColumn('otherrefnum','text', 'PO #', 'LEFT');
    portlet.addColumn('line','text', 'Line ID', 'LEFT');
    portlet.addColumn('item','text', 'Item', 'LEFT');
    portlet.addColumn('bpn','text', 'BPN', 'LEFT');
    portlet.addColumn('vpn','text', 'VPN', 'LEFT');
    portlet.addColumn('upc','text', 'UPC', 'LEFT');
    portlet.addColumn('ediuom','text', 'EDI UOM', 'LEFT');
    portlet.addColumn('manage','text', 'Manage Exception', 'LEFT');

   if (defaultitem) {
	   var results = nlapiSearchRecord(null, 'customsearch_sps_sales_item_exceptions', new nlobjSearchFilter('item', null, 'is', defaultitem), null);
	   for ( var i = 0; results != null && i < results.length; i++ ) {
	    	var result = JSON.parse(JSON.stringify(results[i]));
	    	nlapiLogExecution('DEBUG','RESULT '+i, JSON.stringify(results[i]));
	    	portlet.addRow({
	    		'trandate': result.columns.trandate,
	    		'entity': result.columns.companyname,
	    		'statusref': result.columns.statusref.name,
	    		'tranid': '<a href="/app/accounting/transactions/salesord.nl?id='+results[i].getId()+'">'+result.columns.tranid+'</a>',
	    		'line': result.columns.line,
	    		'item': result.columns.item.name,
	    		'bpn': result.columns.custcol_sps_bpn,
	    		'otherrefnum': result.columns.otherrefnum,
	    		'upc': result.columns.custcol_sps_upc,
	    		'vpn': result.columns.custcol_sps_vendorpartnumber,
	    		'ediuom': result.columns.custcol_sps_orderqtyuom,
	    		'manage': '<a href="'+searchlink+'">Click to Manage</a>'
	    	});
	    }
   }
    
        
}

