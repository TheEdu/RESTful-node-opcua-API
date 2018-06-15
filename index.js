// Import modules
var express = require('express');
var opcua = require('node-opcua');
var async = require('async');
var bodyParser = require('body-parser');

// Initialize express
var app = express();
var expressPort = 3000;
app.use(express.static(__dirname));
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({
    extended: true // to support URL-encoded bodies
}));


function TreeItem() {
    this.nodeId = null;
    this.browseName = null;
    this.displayName = null;
    this.children = [];
}


function generateTree(session,nodeId,treeItemCallback){

    const b = [
            {
                nodeId: nodeId,
                referenceTypeId: "Organizes",
                includeSubtypes: true,
                browseDirection: opcua.browse_service.BrowseDirection.Forward,
                resultMask: 0x3f
            },
            {
                nodeId: nodeId,
                referenceTypeId: "Aggregates",
                includeSubtypes: true,
                browseDirection: opcua.browse_service.BrowseDirection.Forward,
                resultMask: 0x3f
            }
        ];

    var treeItem = new TreeItem();
    var children = [];

    async.series([
    	// step 1 : complete attributes
        function(callback) {
            session.readAllAttributes(nodeId, function (err, res) {
                if(!err){
                    //console.log(res);
                    treeItem.nodeId = res.nodeId;
                    treeItem.browseName = res.browseName;
                    treeItem.displayName = res.displayName;
                }
                callback(err);
            });
        },

 		// step 2 : browse references
        function(callback) {
            session.browse(b, function (err, res) {
                //console.log(res);

                if (!err) {

                    let browseResult = res[0];
                    for (let i = 0; i < browseResult.references.length; i++) {
                        const ref = browseResult.references[i];
                        children.push(ref.nodeId);
                        // generateTree(ref.nodeId,function (err,res){
                        //     if(!err) children.push(res);
                        // });
                    }

                    browseResult = res[1];
                    for (let i = 0; i < browseResult.references.length; i++) {
                        const ref = browseResult.references[i];
                        children.push(ref.nodeId);
                        // generateTree(ref.nodeId,function (err,res){
                        //     if(!err) children.push(res);
                        // });
                    }

                    //treeItem.children = children;
                }

                callback(err);
            });

        },

        // step 3 : push childs (recursivity)
        function(callback) {

            if (treeItem.children == []){
                callback();
            }else{
                async.each(children,function(child,refCallback){
                    generateTree(session,child,function (err,res){
                        if(!err){
                            treeItem.children.push(res);
                        }
                        refCallback(err);
                    });

                }, function(err){
                    callback(err);
                });

            }
        }

    ], function (err) {
        treeItemCallback(err,treeItem);
    });
}


app.post('/tree', function (req, res) {

	endpointUrl = req.body.endpointURL;
	nodeId = req.body.nodeId;

	var options = {
        connectionStrategy: {
            maxRetry: 5
        }
     };

	var client = new opcua.OPCUAClient(options);
	var the_session;

	async.series([
		// step 1 : connect to
		function(callback)  {
		    client.connect(endpointUrl,function (err) {
		        if(err) {
		            console.log(" cannot connect to endpoint :" , endpointUrl );
		        } else {
		            console.log("connected !");
		        }
		        callback(err);
		    });
		},

		// step 2 : createSession
		function(callback) {
		    client.createSession( function(err,session) {
		        if(!err) {
		            the_session = session;
		        } else {
		            console.log("session created !");
		        }
		        callback(err);
		    });
		},

		// step 3 : generateTree
		function(callback) {
			generateTree(the_session,nodeId,function (err,result){
				callback(err,result);
		    });
		},

		// step 4 : close session
        function(callback) {
            the_session.close(function(err){
                if(err) {
                    console.log("session closed failed");
                } else {
                    console.log("session closed");
                }
                callback();
            });
        },

        // step 5 : client disconnected
        function(callback) {
            client.disconnect(function(err){
                if(err) {
                    console.log("client disconnected failed");
                } else {
                    console.log("client disconnected");
                }
                callback();
            });
        }

	], function (err,result) {
	        if(!err){
	        	treeResultIndex = 2; // Result of step 3 : generateTree
	            res.send(result[treeResultIndex]);
	        }else{
	            res.status(500).send(err);
	        }
		}
	);
});


app.post('/status', function (req, res) {
    endpointUrl = req.body.endpointURL;

	var options = {
        connectionStrategy: {
            maxRetry: 5
        }
     };

    var client = new opcua.OPCUAClient(options);

    async.series([
        //step 1: Connect to the Server
        function (callback) {
            client.connect(endpointUrl, function (err) {
                if (err) {
                    console.log("cannot connect to endpoint :", endpointUrl);
                } else {
                    console.log("connected !");
                }
                callback(err);
            })
        },
        // step 2 : Disconnect to the Server
        function (callback) {
            client.disconnect(function (err) {
                callback(err);
            });
        }
    ], function (err) {
    	responseMessage = {
    		url:endpointUrl,
    		con: false,
    		err: err
    	}
        if (!err){
        	responseMessage.con = true;
            res.send(responseMessage);
        }else{
            res.status(500).send(responseMessage);
        }
    });
});

//NodeCrawler
app.post('/crawler', function (req, res) {

    endpointUrl = req.body.endpointURL;
    startNode = req.body.nodeId;

    var nodes = [];

    // Initialize OPC Variables
    var the_session;

    var options = {
        connectionStrategy: {
            maxRetry: 5
        }
      };

    var client = new opcua.OPCUAClient(options);

    client.on("start_reconnection", function() {
        console.log(" ... start_reconnection")
    });

    client.on("backoff", function(nb, delay) {
        console.log("  connection failed for the", nb,
    " time ... We will retry in ", delay, " ms");
    });
	
    async.series([
        // step 1 : connect to
        function(callback)  {
            client.connect(endpointUrl,function (err) {
                if(err) {
                    console.log(" cannot connect to endpoint :" , endpointUrl );
                } else {
                    console.log("connected !");
                }
                callback(err);
            });
        },

        // step 2 : createSession
        function(callback) {
            client.createSession( function(err,session) {
                if(!err) {
                    the_session = session;
                } else {
                    console.log("session created !");
                }
                callback(err);
            });
        },

		// step 3 : crawling
	    function(callback){
            var NodeCrawler = opcua.NodeCrawler;
			var crawler = new NodeCrawler(the_session);

			crawler.on("browsed",function(element){
              nodes.push(element);
			});

            
            console.log("now crawling '" + startNode + "' ...please wait...");			
			crawler.read(startNode, function (err, obj) {
				callback(err);
			});
	    },

        // step 4 : close session
        function(callback) {
            the_session.close(function(err){
                if(err) {
                    console.log("session closed failed");
                } else {
                    console.log("session closed");
                }
                callback();
            });
        },

        // step 5 : client disconnected
        function(callback) {
            client.disconnect(function(err){
                if(err) {
                    console.log("client disconnected failed");
                } else {
                    console.log("client disconnected");
                }
                callback();
            });
        }

	], function (err) {

        if (!err){
            res.send(nodes);
        } else{
            res.status(500).send(err);
        }
    });

});


// Initialize the server to listen on a custom Port
app.listen(expressPort, function () {
    console.log('server listening on port 3000');
});