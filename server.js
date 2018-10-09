var server = require('http').createServer();

// var io = require('socket.io')(server,{
//   pingInterval: 10000,
//   pingTimeout: 20000
// });
var io = require('socket.io')(server);

/* phases indexes for enum mapping for unity */
const phases = {
  LOADING: 0,
  WELCOME: 1,
  BUILDING: 2,
  INTERMEZZO: 3,
  FIREFIGHT: 4,
  FAIL: 5,
  WIN: 6,
}


var timeouts = [];
var mainAppLoopInterval = null;


var currentPhase = phases.LOADING;
var maxPlayers = 1;

var players = {};
var waiting = {};
//receiver bude main app
var receiver = null;
var recieverSocket = null;

function Player(id) {
    this.id = id;
}

function StopMappingApp() {
  currentPhase = phases.LOADING;
  players = {};
  waiting = {};
  for (var i=0; i<timeouts.length; i++) {
    clearTimeout(timeouts[i]);
  }
  timeouts = [];  
  clearInterval(mainAppLoopInterval);
}

function StartMappingApp() {
  ChangePhaseTo(phases.LOADING);
  //TODO obtain params for App round
  //periodicaly sent current phase to all
  mainAppLoopInterval = setInterval(MappingAppLoop, 10000, 'params?');
}

function RestartMappingApp() {
  StopMappingApp();
  StartMappingApp();
  StartBuildingPhase();
}

function MappingAppLoop(arg) {
  console.log('current phase is ' + currentPhase);
  io.emit('recieveCurrentPhase', {phase:currentPhase});

  
}

function ChangePhaseTo(phase) {
  currentPhase = phase;
  console.log('changing phase to ' + currentPhase);
  io.emit('changePhase', {phase:currentPhase});
}

function StartWelcomePhase() {
  //Asi zatim nic
  ChangePhaseTo(phases.WELCOME);
  timeouts.push(setTimeout(StartBuildingPhase, 1000));  
}

function StartBuildingPhase() {
  //odpojit vsechny lidi do waiting faze pokud jich je hodne2
  ChangePhaseTo(phases.BUILDING);
  timeouts.push(setTimeout(StartIntermezzoPhase, 50000));
}

function StartIntermezzoPhase() {
  ChangePhaseTo(phases.INTERMEZZO);
  timeouts.push(setTimeout(StartFireFightPhase, 7000));

}

function StartFireFightPhase() {
  //odpojit vsechny lidi do waiting faze pokud jich je hodne
  ChangePhaseTo(phases.FIREFIGHT);
  timeouts.push(setTimeout(StartFailPhase, 50000));
  //setTimeout(StartWinPhase, 10000);
}

function StartFailPhase() {
  ChangePhaseTo(phases.FAIL);
  timeouts.push(setTimeout(RestartMappingApp, 7000));
}

function StartWinPhase() {
  ChangePhaseTo(phases.WIN);
  RestartMappingApp();
  timeouts.push(setTimeout(RestartMappingApp, 7000));
}


//create simgle instance for mother app
io.sockets.on('connection', function (socket) {

    // GENERAL
    socket.on('initialize', function (data) {//called when a new client connects
      var playersCount = Object.keys(players).length; 
      //TODO nepoustet do hry pokud zbyva kostek jako aktualne hrajicich hracu
      var id = socket.id;
      var newPlayer = new Player(id);
      if(playersCount<maxPlayers) {

        //new Player (id, data.name, data.avatar);
        // Creates a new player object with a unique ID number.

        players[id] = newPlayer;
        // Adds the newly created player to the array.
        //TODO poslat nasledujici videomapingovou cast, pokud zbyva uz jen chvile, jako ze se neda hrat, ale nasledujici kolo si zahrati bude moci
        socket.emit('obtainId', {id: id, phase:currentPhase});
        // Sends the connecting client his unique ID.

        if (receiver != null) {
            // Sends receiver data about the new player.
            io.sockets.connected[receiver].emit('playerJoined', newPlayer);
        }

        console.log("Player connected: " + id);
      } else {
        waiting[id] = newPlayer;
        console.log("too many players: " + playersCount+", max is "+maxPlayers);
        socket.emit('maxPlayersReached',{players: playersCount, maxPlayers: maxPlayers});

        //new Player (id, data.name, data.avatar);
        // Creates a new player object with a unique ID number.


      }
    });

    //[JW] What happens, if a "waiting" client gets disconnected?
    socket.on('disconnect', function (reason) { //called when a client disconnects
      //TODO jak reciever
      if (socket.id == receiver) {
          receiver = null;
          recieverSocket = null;
      }
      
      //TODO pohlidat ze jedou za sebou
      if(Object.keys(waiting).length>0) {      
        var id = Object.keys(waiting)[0];
        players[id] = waiting[id];
        io.sockets.connected[id].emit('obtainId', {id: id, phase:currentPhase});
        delete waiting[id];
      }
      
      if ((receiver != null) && (socket.id != receiver)) {
          // Sends receiver data about the new player.
          io.sockets.connected[receiver].emit('playerLeave', {id: socket.id});
      }
      console.log("Disconnected: " + socket.id + ", reason: " + reason);
      delete players[socket.id];
      
    });
  
    socket.on('reenter', function () { //called when a client reenter
      
      if ((receiver != null) && (socket.id != receiver)) {
          // Sends receiver data about the new player.
          io.sockets.connected[receiver].emit('playerLeave', {id: socket.id});
      }
      console.log("Disconnected: " + socket.id + ", reason: REENTER");
      delete players[socket.id];
      
    });
    
    socket.on ('receiver', function () { //called when the "receiver" (i.e. Unity app) connects
       receiver=socket.id;
       recieverSocket = io.sockets.connected[receiver]
       recieverSocket.emit ('players', players);
     
    });
  
  
    socket.on('debug', function (data) { //receives joystick data from mobile client and sends them to the receiver
        console.log("debug:" + data.id + ": " + data.text);
        //socket.broadcast.emit ('playerMoved', data);
    });

});

console.log('Server started.');
server.listen(3000);
//JUST FOR TEST
StartMappingApp();
//TODO bude se startovat hlasvni appkou
StartBuildingPhase();

  /*
     socket.on ('positionUpdate', function (data) { // receives recalculated mobile clients position data and sends them out
     //console.log("position update: ");
     // for(var id in data){
     // console.log(id+" - "+data[id].x+", "+data[id].y+", "+data[id].z);
     // }
       
       socket.broadcast.emit ('phaseChanged', data);
     });*/


    // TO RECEIVER
    /*
     socket.on ('joystick', function (data) { //receives joystick data from mobile client and sends them to the receiver
     console.log("joystick:"+data.x+", "+data.y+" - "+data.id);
     if(receiver!=null){
     io.sockets.connected[receiver].emit("joystickData", data);
     }
     //socket.broadcast.emit ('playerMoved', data);
     });*/


    /*
     socket.on ('highlight', function () {//receives highlight request from mobile client and sends it to the receiver
     console.log("highlight:"+socket.id);
     if(receiver!=null){
     var id=socket.id;
     io.sockets.connected[receiver].emit("highlight", {id: id});
     }
     //socket.broadcast.emit ('playerMoved', data);
     });
     */
    /*
     socket.on ('bomb', function () {//receives highlight request from mobile client and sends it to the receiver
     console.log("bomb:"+socket.id);
     if(receiver!=null){
     var id=socket.id;
     io.sockets.connected[receiver].emit("bomb", {id: id});
     }
     //socket.broadcast.emit ('playerMoved', data);
     });*/



    // FROM RECEIVER
    /*
     socket.on ('positionUpdate', function (data) { // receives recalculated mobile clients position data and sends them out
     //console.log("position update: ");
     // for(var id in data){
     // console.log(id+" - "+data[id].x+", "+data[id].y+", "+data[id].z);
     // }
     socket.broadcast.emit ('playerMoved', data);
     });
     
     
     socket.on ('waiting', function (data) { //called when waiting due full players capacity
     
     if(io.sockets.connected[data.id]!=null){
     io.sockets.connected[data.id].emit ('waiting');
     }
     
     });
     */

    /*
     socket.on ('start', function (data) { //called when the "receiver" (i.e. Unity app) connects
     console.log("Start to "+data.id);
     if(io.sockets.connected[data.id]!=null){
     io.sockets.connected[data.id].emit ('start');
     }
     
     });
     
     socket.on ('end', function (data) { //called when the "receiver" (i.e. Unity app) connects
     console.log("End to "+data.id);
     if(io.sockets.connected[data.id]!=null){
     io.sockets.connected[data.id].emit ('end');
     }
     
     });*/

