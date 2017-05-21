// =======================
// get the packages we need ============
// =======================
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var morgan = require('morgan');
var http = require('http');
var Converter = require("csvtojson").Converter;
var mysql = require('mysql');
var dateFormat = require('dateformat');
var jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
var config = require('./config_default'); // get our config file
var sendmail = require('sendmail')();
const querystring = require('querystring');


// =======================
// configuration =========
// =======================
var port = process.env.PORT || 8080; // used to create, sign, and verify tokens
app.set('secret', config.secret); // secret variable


// use body parser so we can get info from POST and/or URL parameters
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/web'));


//connection to mysql database
var connection = mysql.createConnection({
    host: config.db_host,
    user: config.db_user,
    password: config.db_password,
    database : config.db_name
});
connection.connect();


// use morgan to log requests to the console
app.use(morgan('dev'));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


// =======================
// routes ================
// =======================
// basic route
app.get('/', function(req, res) {
    res.send('Hello! The API is at http://localhost:' + port + '/api');
});


app.get('/sendMail',function(req,res) {
	sendmail({
	  from: 'marconiTT@marconivr.com',
	  to: 'fedrigo22@gmail.com',
	  replyTo: 'giuseppe.tanello@gmail.com',
	  subject: 'Email prova',
	  html: 'Questa è di prova'
	}, function (err, reply) {
	  console.log(err && err.stack)
	  console.dir(reply)
	});
	res.send("ok");
});


// =======================
// API ROUTES -------------------
// =======================

// get an instance of the router for api routes
var apiRoutes = express.Router();


// route to authenticate a user (POST http://localhost:8080/api/authenticate)
apiRoutes.post('/authenticate', function(req, res) {
    //query to search if user is in db
    var sql_stmt = "SELECT admin FROM users WHERE username ='" + req.body.name + "'";

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            try {
                var adm = rows[0].admin;
                var admin = adm === 0 ? false : true;
                var user = { 
                    username: req.body.name,
                    password: req.body.password,
                    admin: admin
                };
                
                const postData = querystring.stringify({
                    'username': req.body.name,
                    'password': req.body.password
                });

                const options = {
                hostname: config.webserver,
                port: 80,
                path: '/ldap/login/loginldap_marconitt.php',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const request = http.request(options, (result) => {
                    console.log(`STATUS: ${res.statusCode}`);
                    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
                    result.setEncoding('utf8');
                    result.on('data', (chunk) => {
                        console.log(`BODY: ${chunk}`);
                        if (chunk == 'true') {
                            var token = jwt.sign(user, app.get('secret'), { 
                                expiresInMinutes: 1440 // expires in 24 hours 
                            }); 

                            // return the information including token as JSON 
                            res.json({ 
                                success: true, 
                                message: 'Enjoy your token!', 
                                token: token, 
                                username: user.username, 
                                admin: user.admin 
                            }); 
                        } else {
                            res.json({ success: false, message: 'Credenziali errate.' });
                        }
                    });
                    result.on('end', () => {
                        console.log('No more data in response.');
                    });
                });
                request.on('error', (e) => {
                console.error(`problem with request: ${e.message}`);
                });

                // write data to request body
                request.write(postData);
                request.end();
            } catch(e) {
                res.json({ success: false, message: 'Credenziali errate.' });
            }
        }
    });
});


apiRoutes.post('/verifyToken', function(req, res, next) {
    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token
    if (token) {
        // verifies secret and checks exp
        jwt.verify(token, app.get('secret'), function(err, decoded) {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token.' });
            } else {
                // if everything is good, save to request for use in other routes
                req.decoded = decoded;
                res.json({
                    success: true, 
                    username: decoded.username,
                    admin: decoded.admin
                });
                next();
            }
        });
    } else {
        // if there is no token
        // return an error
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });
    }
});


// route to show a random message (GET http://localhost:8080/api/)
apiRoutes.get('/', function(req, res) {
    res.json({ message: 'Welcome to the coolest API on earth!' });
});


// route middleware to verify a token
// methods declared after this call require token has to be passed 
apiRoutes.use(function(req, res, next) {
    // check header or url parameters or post parameters for token
    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token
    if (token) {
        // verifies secret and checks exp
        jwt.verify(token, app.get('secret'), function(err, decoded) {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token.' });
            } else {
                // if everything is good, save to request for use in other routes
                req.decoded = decoded;
                next();
            }
        });
    } else {
        // if there is no token
        // return an error
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });
    }
});


apiRoutes.post('/prenota', function(req, res) {
	var stanza = req.body.stanza;
	var giorno = req.body.giorno;
	var ora = req.body.ora;
	var risorsa = req.body.risorsa;
	var isClasse = (req.body.isclasse == "true");
    var user = req.body.user;
    var admin = req.body.admin;

    if(isClasse) {
        isSchoolOur(giorno, stanza, ora, risorsa, function(response) {
            if(response) {
                addPrenotazione(giorno, stanza, ora, risorsa, user, true, admin,  function(response1) {
                    res.json(response1);
                });
            } else {
                addPrenotazione(giorno, stanza, ora, risorsa, user, false, admin, function(response1) {
                    res.json(response1);
                });
            }
        });
    } else {
        addPrenotazione(giorno, stanza, ora, risorsa, user, false, admin, function(response) {
            res.json(response);
        });
    }
});


apiRoutes.post('/approva', function(req, res) {
    var stanza = req.body.stanza;
	var giorno = req.body.giorno;
	var ora = req.body.ora;
    var id;

    selectId(giorno, stanza, ora, function(response) {
        id = response;
        var sql_stmt = "UPDATE prenotazioni SET approvata = True WHERE id = " + id;

        connection.query(sql_stmt, function(err) {
            if (!err) {
                res.json(true);
            } else {
                res.json(false);
            }
        });
    });
});


apiRoutes.delete('/cancellaPrenotazione', function(req, res) {
    var stanza = req.body.stanza;
	var giorno = req.body.giorno;
	var ora = req.body.ora;
    var risorsa = req.body.risorsa;

    selectId(giorno, stanza, ora, function(response) {
        var id = response;
        sql_stmt = "SELECT isSchoolHour FROM prenotazioni WHERE id = " + id;

        connection.query(sql_stmt, function(err, rows, fields) {
            if (!err) {
                var isSOur = rows[0].isSchoolHour;

                if(isSOur) {
                    undoClasse(stanza, giorno, ora, risorsa, function(response2) {
                        if(response2) {
                            cancellaPrenotazione(stanza, giorno, ora, function(response1) {
                                res.json(response1);
                            })
                        } else {
                            res.json(false);
                        }
                    });
                } else {
                    cancellaPrenotazione(stanza, giorno, ora, function(response3) {
                        res.json(response3);
                    })
                }
            } else {
                res.json(false);
            }
        });
    });
});


apiRoutes.post('/creaEvento', function(req, res) {
    var oraInizio = 1;
    var oraFine = 0;
    var professori = "";
    var id;

    //Prendo le variabili dal form
    var descrizione = req.body.descrizione;
    var giorno = req.body.day;
    var start = req.body.oraInizio;
    var end = req.body.oraFine;
    var classi = req.body.classi;
    var stanze = req.body.stanze;

    //sistemo le ore
    hourToStartHour(giorno, start, function(res1) {
        oraInizio = res1;

        hourToEndHour(giorno, end, function(res1) {
            oraFine = res1;

            //inserisco l'evento
            var sql_stmt = "INSERT INTO eventi(giorno, descrizione, oraInizio, oraFine, classi, stanze) VALUES('" + giorno + "', '" + 
                descrizione + "', '" + start + "', '" + end + "', '" + classi + "', '" + stanze + "')";
            
            connection.query(sql_stmt, function(err) {
                if(!err) {
                    res.json(true);
                    //seleziono l'id dell'evento inserito
                    sql_stmt = "SELECT id FROM eventi WHERE giorno = '" + giorno + "' AND descrizione = '" + descrizione 
                        + "' AND oraInizio = '" + start + "' AND oraFine = '" + end + "'";

                    connection.query(sql_stmt, function(err, rows, fields) {
                        if (!err) {
                            id = rows[0].id;
                            cont = oraInizio;
                            var vett = [];

                            while(cont <= oraFine) {
                                vett.push(cont);
                                cont++;
                            }
                            cont = 0;
                            for(ora in vett) {
                                profInEventi(classi, id, giorno, vett[ora]);
                            }
                        } else {
                            res.json(false);
                        }
                    });
                } else {
                    res.json(false);
                }
            });
        })
    })
});


apiRoutes.delete('/cancellaEvento', function(req, res) {
    var id = req.body.id;
    var sql_stmt = "DELETE FROM prof_eventi WHERE id = " + id;

    connection.query(sql_stmt, function(err) {
        if (!err) {
            sql_stmt = "DELETE FROM eventi WHERE id = " + id;

            connection.query(sql_stmt, function(err) {
                if (!err) {
                    res.json(true);
                } else {
                    res.json(false);
                }
            });
        } else {
            res.json(false);
        }
    });
});


apiRoutes.post('/liberaRisorse', function(req, res) {
    var classe = req.body.classe;
    var s_ore = req.body.ore;
    var giorno = req.body.day;
    var descrizione = req.body.descrizione;

    var ore = s_ore.split(",");
    var sql_stmt;
    var stanza;
    var id;

    sql_stmt = "INSERT INTO liberazione(giorno, descrizione, classe, ore) VALUES ('" + giorno + "', '" + 
        descrizione + "', '" + classe + "', '" + ore + "')";

    connection.query(sql_stmt, function(err) {
        if (!err) {
            //seleziono l'id della liberazione
            sql_stmt = "SELECT id FROM liberazione WHERE giorno = '" + giorno + "' AND ore = '" + ore 
                + "' AND descrizione = '" + descrizione + "' AND classe = '" + classe + "'";

            connection.query(sql_stmt, function(err, rows, fields) {
                if (!err) {
                    id = rows[0].id;

                    for(var i in ore) {
                        liberazione(id, classe, ore[i], giorno);
                    }
                    res.json(true);
                } else {
                    res.json(false);
                }
            });
        } else {
            res.json(false);
        }
    });
});


// apply the routes to our application with the prefix /api
app.use('/api', apiRoutes);


// =======================
// start the server ======
// =======================
app.listen(port);
console.log('Magic happens at http://localhost:' + port);


// =======================
// functions =============
// =======================

/*
 * Funzione che setta la risorsa nella timetable ed aggiunge la prenotazione nella timetable
 */
function addPrenotazione(giorno, stanza, ora, risorsa, who, èOraScuola, admin, res) {
    var sql_stmt = "UPDATE timetable SET risorsa = '" + risorsa + "' WHERE stanza = '" +
        stanza + "' AND ora = " + ora + " AND giorno = '" + giorno + "';";

    connection.query(sql_stmt, function(err) {
        if (!err) {
            selectId(giorno, stanza, ora, function(id) {
                sql_stmt = "INSERT INTO prenotazioni VALUES(" + id + ", '" + who + "', " + èOraScuola + ", " + admin + ");";
                connection.query(sql_stmt, function(err) {
                     if (!err) {
                        res(true);
                    } else {
                        res(false);
                    }
                });
            })
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che ricerca e ritorna un id dalla timetable
 */
function  selectId(giorno, stanza, ora, res) {
    var sql_stmt = "SELECT id FROM timetable WHERE stanza = '" + stanza + "' AND ora = " + ora + " AND giorno = '" + giorno + "';";
    
    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            res(rows[0].id);
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che vede se la prenotazione per una classe è durante l'orario scolastico.
 * Se si, allora libera l'aula precedentemente occupata da tale classe.
 */
function isSchoolOur(giorno, stanza, ora, risorsa, res) {
    var sql_stmt = "SELECT giorno_settimana FROM timetable WHERE stanza = '" + stanza + "' AND giorno = '" 
        + giorno + "' AND ora = " + ora + ";";

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            var week_day = rows[0].giorno_settimana;
            sql_stmt = "SELECT `Column 4` AS oldStanza FROM GPU001 WHERE `Column 5` = " + week_day + " AND `Column 6` = '" 
                + ora + "' AND `Column 1` = '" + risorsa + "';";

            connection.query(sql_stmt, function(err, rows, fields) {
                if (!err) {
                    try {
                        var oldStanza = rows[0].oldStanza;
                        sql_stmt = "SELECT stanza FROM timetable WHERE ora = " + ora  + " AND  giorno = '" 
                            + giorno + "' AND risorsa = '" + risorsa + "';";

                        connection.query(sql_stmt, function(err, rows, fields) {
                            if (!err) {
                                try {
                                    var stanzaDaLib = rows[0].stanza;

                                    moveProfessori(stanza, stanzaDaLib, giorno, ora, function(resp) {
                                        if(resp) {
                                            liberaRisorse(stanzaDaLib, ora, giorno, function(response) {
                                                res(response);
                                            });
                                        } else {
                                            res(false);
                                        }
                                    })
                                } catch(e) {
                                    getProfFromOrario(stanza, giorno, ora, risorsa, function(resp) {
                                        if(resp == false) {
                                            res(false);
                                        } else {
                                            sql_stmt = resp;
                                            connection.query(sql_stmt, function(err) {
                                                if (!err) {
                                                    res(true);
                                                } else {
                                                    res(false);
                                                }
                                            });
                                        }
                                    });
                                }
                            } else {
                                res(false);
                            }
                        });
                    } catch(e) {
                        res(false);
                    }
                } else {
                    res(false);
                }
            });
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che libera l'aula occupata da una determinata classe e dai professori ad essa associati.
 */
function liberaRisorse(stanza, ora, giorno, res) {
    var sql_stmt = "UPDATE timetable SET risorsa = Null, professore1 = Null, professore2 = Null, professoreS = Null " + 
        "WHERE stanza = '" + stanza + "' AND ora = " + ora + " AND giorno = '" + giorno + "';";

    connection.query(sql_stmt, function(err) {
        if (!err) {
            controllaPrenotazioni(stanza, giorno, ora, function(response) {
                res(response);
            });
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che ritorna il professore1 dalla timetable in una determinata riga.
 */
function getProf1(stanza, giorno, ora, res) {
    var sql_stmt = "SELECT professore1 FROM timetable WHERE stanza = '" + stanza + "' AND giorno = '" 
        + giorno + "' AND ora = " + ora + ";";

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            var prof1 = rows[0].professore1;
            res(prof1);
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che ritorna il professore2 dalla timetable in una determinata riga.
 */
function getProf2(stanza, giorno, ora, res) {
    var sql_stmt = "SELECT professore2 FROM timetable WHERE stanza = '" + stanza + "' AND giorno = '" 
        + giorno + "' AND ora = " + ora + ";";

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            var prof2 = rows[0].professore2;
            res(prof2);
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che sposta i professori dalla loro aula a quella prenotata per la rispettiva classe.
 */
function moveProfessori(stanza, stanzaDaLib, giorno, ora, res) {
    getProf1(stanzaDaLib, giorno, ora, function(response1) {
        prof1 = response1;
        getProf2(stanzaDaLib, giorno, ora, function(response2) {
            prof2 = response2;
            var sql_stmt = "UPDATE timetable SET professore1 = '" + prof1 + "' WHERE ora = " + ora +
                " AND stanza = '" + stanza + "' AND giorno = '" + giorno + "';";

            connection.query(sql_stmt, function(err) {
                if (!err) {
                    try {
                        var appo = prof2.split(" ")[0];
                        var sql_stmt = "UPDATE timetable SET professore2 = '" + prof2 + "' WHERE ora = " + ora +
                            " AND stanza = '" + stanza + "' AND giorno = '" + giorno + "';";

                        connection.query(sql_stmt, function(err) {
                            if (!err) {
                                res(true);
                            } else {
                                res(false);
                            }
                        });
                    } catch(e) {
                        var sql_stmt = "UPDATE timetable SET professore2 = Null WHERE ora = " + ora +
                            " AND stanza = '" + stanza + "' AND giorno = '" + giorno + "';";

                        connection.query(sql_stmt, function(err) {
                            if (!err) {
                                res(true);
                            } else {
                                res(false);
                            }
                        });
                    }
                } else {
                    res(false);
                }
            });
        });
    });
}


/*
 * Funzione che ritorna un codice sql per inserire i professori, presi dall'orario, nella timetable
 */
function getProfFromOrario(stanza, giorno, ora, risorsa, res) {
    var prof1;
    var prof2;
    console.log("A che sono finito qui");
    var sql_stmt = "SELECT giorno_settimana FROM timetable WHERE stanza = '" + stanza + "' AND giorno = '" 
        + giorno + "' AND ora = " + ora + ";";

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            var week_day = rows[0].giorno_settimana;

            sql_stmt = "SELECT `Column 2` AS prof FROM GPU001 WHERE `Column 5` = " + week_day + " AND `Column 6` = '" 
                + ora + "' AND `Column 1` = '" + risorsa + "';";

            connection.query(sql_stmt, function(err, rows1, fields) {
                if (!err) {
                    var p1 = rows1[0].prof;

                    try {
                        var p2 = rows1[1].prof;
                        sql_stmt = "SELECT `Column 1` AS nomeCognome FROM GPU004 WHERE `Column 0` = '" + p2 + "'";

                        connection.query(sql_stmt, function(err, rows, fields) {
                            if (!err) {
                                prof2 = rows[0].nomeCognome;
                                sql_stmt = "SELECT `Column 1` AS nomeCognome FROM GPU004 WHERE `Column 0` = '" + p1 + "'";

                                connection.query(sql_stmt, function(err, rows, fields) {
                                    if (!err) {
                                        prof1 = rows[0].nomeCognome;
                                        sql_stmt = "UPDATE timetable SET professore1 = '" + prof1 + "', professore2 = '" + prof2 +
                                            "' WHERE stanza = '" + stanza  + "' AND ora = " + ora + " AND giorno = '" + giorno + "'";
                                        res(sql_stmt);
                                    } else {
                                        res(false);
                                    }
                                });
                            } else {
                                res(false);
                            }
                        });
                    } catch(e) {
                        var prof2 = "Null";
                        sql_stmt = "SELECT `Column 1` AS nomeCognome FROM GPU004 WHERE `Column 0` = '" + p1 + "'";

                        connection.query(sql_stmt, function(err, rows, fields) {
                            if (!err) {
                                prof1 = rows[0].nomeCognome;
                                sql_stmt = "UPDATE timetable SET professore1 = '" + prof1 + "', professore2 = '" + prof2 +
                                    "' WHERE stanza = '" + stanza  + "' AND ora = " + ora + " AND giorno = '" + giorno + "'";
                                res(sql_stmt);
                            } else {
                                res(false);
                            }
                        });
                    }
                } else {
                    res(false);
                }
            });
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che controlla se una prenotazione per una classe dovrebbe annullarne un'altra.
 * In caso positivo, cancella la prenotazione da annullare.
 */
function controllaPrenotazioni(stanza, giorno, ora, res) {
    sql_stmt = "SELECT id FROM timetable WHERE stanza = '" + stanza + "' AND giorno = '" + giorno + "' AND ora = " + ora + ";";

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            var id1 = rows[0].id;
            sql_stmt = "SELECT id FROM prenotazioni WHERE id = " + id1;

            connection.query(sql_stmt, function(err, rows, fields) {
                if(!err) {
                    try {
                        var id2 = rows[0].id;
                        sql_stmt = "DELETE FROM prenotazioni WHERE id = " + id2;
                        
                        connection.query(sql_stmt, function(err) {
                            if(!err) {
                                res(true);
                            } else {
                                res(false);
                            }
                        });
                    } catch(e) {
                        res(true);
                    }
                } else {
                    res(false);
                }
            });
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che cancella una data prenotazione.
 */
function cancellaPrenotazione(stanza, giorno, ora, res) {
    var sql_stmt = "UPDATE timetable SET risorsa = Null, professore1 = Null, professore2 = Null, professoreS = Null " + 
        "WHERE stanza = '" + stanza + "' AND ora = " + ora + " AND giorno = '" + giorno + "';";
    
    connection.query(sql_stmt, function(err) {
        if(!err) {
            selectId(giorno, stanza, ora, function(id) {
                sql_stmt = "DELETE FROM prenotazioni WHERE id = " + id;

                connection.query(sql_stmt, function(err) {
                    if(!err) {
                        res(true);
                    } else {
                        res(false);
                    }
                });
            });
        } else {
            res(false);
        }
    });
}


/*
 * Funzione che fa tornare una classe nella sua stanza, secondo l'orario scolastico, se essa è libera
 * Altrimenti BISOGNA DECIDERE COSA FARE
 */
function undoClasse(stanza, giorno, ora, risorsa, res) {
    var sql_stmt = "SELECT giorno_settimana FROM timetable WHERE stanza = '" + stanza + "' AND giorno = '" 
        + giorno + "' AND ora = " + ora + ";";

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            var week_day = rows[0].giorno_settimana;

            sql_stmt = "SELECT `Column 4` AS stanzaOrario FROM GPU001 WHERE `Column 5` = " + week_day + " AND `Column 6` = '" 
                + ora + "' AND `Column 1` = '" + risorsa + "';";

            connection.query(sql_stmt, function(err, rows, fields) {
                if (!err) {
                    var stanzaOrario = rows[0].stanzaOrario;
                    sql_stmt = "SELECT risorsa FROM timetable WHERE stanza = '" +
                        stanzaOrario + "' AND ora = " + ora + " AND giorno = '" + giorno + "';";
                    
                    connection.query(sql_stmt, function(err, rows, fields) {
                        if (!err) {
                            classe = rows[0].risorsa;

                            if(classe != null) {
                                console.log("E' già occupata");
                                res(true);
                            } else {
                                var sql_stmt = "UPDATE timetable SET risorsa = '" + risorsa + "' WHERE stanza = '" +
                                    stanzaOrario + "' AND ora = " + ora + " AND giorno = '" + giorno + "';";

                                connection.query(sql_stmt, function(err) {
                                    if (!err) {
                                        moveProfessori(stanzaOrario, stanza, giorno, ora, function(response) {
                                            res(response);
                                        });
                                    } else {
                                        res(false);
                                    }
                                });
                            }
                        } else {
                            res(false);
                        }
                    });
                } else {
                    res(false);
                }
            });
        } else {
            res(false);
        }
    });
}


function profInEventi(classi, id, giorno, ora, res) {
    var vett = classi.split(",");
    var sql_stmt = "";
    var professori = "";
    var prof1, prof2 = "";
    var tot = vett.length * 2;
    var cont = 0;
    var ret = 0;

    for(i in vett) {
        sql_stmt = "SELECT professore1, professore2 FROM timetable WHERE risorsa = '" + vett[i] +
            "' AND ora = " + ora + " AND giorno = '" + giorno + "'";

        connection.query(sql_stmt, function(err, rows, fields) {
            if (!err) {
                try {
                    professori += rows[0].professore1 + ", ";
                    cont = cont + 1;
                    professori += rows[0].professore2 + ", ";
                    cont = cont + 1;

                    if(cont == tot) {
                        professori = professori.replace("null, ", "");
                        var sql_stmt = "INSERT INTO prof_eventi VALUES(" + id + ", " + ora + ", '" + professori + "')";
                        connection.query(sql_stmt);;
                    }
                } catch(e) {
                    cont = cont + 1;

                    if(cont == tot) {
                        professori = professori.replace("null, ", "");
                        var sql_stmt = "INSERT INTO prof_eventi VALUES(" + id + ", " + ora + ", '" + professori + "')";
                        connection.query(sql_stmt);
                    }
                }
            } else {
                cont = cont + 2;

                if(cont == tot) {
                    professori = professori.replace("null, ", "");
                    var sql_stmt = "INSERT INTO prof_eventi VALUES(" + id + ", " + ora + ", '" + professori + "')";
                    connection.query(sql_stmt);
                }
            }
        });
    }
}


function hourToEndHour(giorno, data, res) {
    var schoolOur = 0;

    var vett = giorno.split("-");
    var year = vett[0];
    var month = vett[1];
    var day = vett[2];

    vett = data.split(":");
    var hour = vett[0];
    var minute = vett[1];

    var dt = new Date(year, month, day, hour, minute, 0);

    if(dt >= new Date(year, month, day, "8", "00") && dt <= new Date(year, month, day, "9", "00")) {
        schoolOur = 1;
    } else if(dt > new Date(year, month, day, "9", "00") && dt <= new Date(year, month, day, "10", "00")) {
        schoolOur = 2;
    } else if(dt > new Date(year, month, day, "10", "00") && dt <= new Date(year, month, day, "11", "00")) {
        schoolOur = 3;
    } else if(dt > new Date(year, month, day, "11", "00") && dt <= new Date(year, month, day, "12", "00")) {
        schoolOur = 4;
    } else if(dt > new Date(year, month, day, "12", "00") && dt <= new Date(year, month, day, "13", "00")) {
        schoolOur = 5;
    } else if(dt > new Date(year, month, day, "13", "00") && dt <= new Date(year, month, day, "14", "30")) {
        schoolOur = 6;
    } else if(dt > new Date(year, month, day, "14", "30") && dt <= new Date(year, month, day, "15", "30")) {
        schoolOur = 7;
    } else if(dt > new Date(year, month, day, "15", "30") && dt <= new Date(year, month, day, "16", "30")) {
        schoolOur = 8;
    } else if(dt > new Date(year, month, day, "16", "30") && dt <= new Date(year, month, day, "17", "30")) {
        schoolOur = 9;
    } else if(dt > new Date(year, month, day, "17", "30") && dt <= new Date(year, month, day, "18", "30")) {
        schoolOur = 10;
    }

    res(schoolOur);
}


function hourToStartHour(giorno, data, res) {
    var schoolOur = 0;

    var vett = giorno.split("-");
    var year = vett[0];
    var month = vett[1];
    var day = vett[2];

    vett = data.split(":");
    var hour = vett[0];
    var minute = vett[1];

    var dt = new Date(year, month, day, hour, minute, 0);

    if(dt >= new Date(year, month, day, "8", "00") && dt < new Date(year, month, day, "9", "00")) {
        schoolOur = 1;
    } else if(dt >= new Date(year, month, day, "9", "00") && dt < new Date(year, month, day, "10", "00")) {
        schoolOur = 2;
    } else if(dt >= new Date(year, month, day, "10", "00") && dt < new Date(year, month, day, "11", "00")) {
        schoolOur = 3;
    } else if(dt >= new Date(year, month, day, "11", "00") && dt < new Date(year, month, day, "12", "00")) {
        schoolOur = 4;
    } else if(dt >= new Date(year, month, day, "12", "00") && dt < new Date(year, month, day, "13", "00")) {
        schoolOur = 5;
    } else if(dt >= new Date(year, month, day, "13", "00") && dt < new Date(year, month, day, "14", "30")) {
        schoolOur = 6;
    } else if(dt >= new Date(year, month, day, "14", "30") && dt < new Date(year, month, day, "15", "30")) {
        schoolOur = 7;
    } else if(dt >= new Date(year, month, day, "15", "30") && dt < new Date(year, month, day, "16", "30")) {
        schoolOur = 8;
    } else if(dt >= new Date(year, month, day, "16", "30") && dt < new Date(year, month, day, "17", "30")) {
        schoolOur = 9;
    } else if(dt >= new Date(year, month, day, "17", "30") && dt < new Date(year, month, day, "18", "30")) {
        schoolOur = 10;
    }

    res(schoolOur);
}


function liberazione(id, classe, ora, giorno) {
    var sql_stmt = "SELECT stanza FROM timetable WHERE risorsa = '" + classe + "' AND ora = " + ora + " AND giorno = '" + giorno + "'";
    var prof1;
    var prof2;
    var professori;
    var vett = [];

    connection.query(sql_stmt, function(err, rows, fields) {
        if (!err) {
            try {
                stanza = rows[0].stanza;
                vett.push(stanza);
            } catch(e) {
                sql_stmt = "INSERT INTO prof_liberazione VALUES(" + id + ", " + ora + ", NULL)";
                connection.query(sql_stmt);
                return;
            }
            sql_stmt = "SELECT professore1, professore2 FROM timetable WHERE ora = " + ora + 
                " AND risorsa = '" + classe + "' AND giorno = '" + giorno + "'";

            connection.query(sql_stmt, function(err, rows, fields) {
                if (!err) {
                    try {
                        prof1 = rows[0].professore1;
                        prof2 = rows[0].professore2;
                        professori = prof1 + ", " + prof2;
                        professori = professori.replace(", null", "");

                        sql_stmt = "INSERT INTO prof_liberazione VALUES(" + id + ", " + ora + ", '" + professori + "')";
                        connection.query(sql_stmt);

                        for(i in vett) {
                            cancellaPrenotazione(stanza, giorno, ora, function(response) {
                                //console.log("liberata");
                            });
                        }
                    } catch(e) {
                        prof2 = "";
                        professori = prof1 + ", " + prof2;
                        professori = professori.replace(", null", "");
                        
                        sql_stmt = "INSERT INTO prof_liberazione VALUES(" + id + ", " + ora + ", '" + professori + "')";
                        connection.query(sql_stmt);

                        for(i in vett) {
                            cancellaPrenotazione(stanza, giorno, ora, function(response) {
                                //console.log("liberata");
                            });
                        }
                    }
                }
            });
        }
    });
}