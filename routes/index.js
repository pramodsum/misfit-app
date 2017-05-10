var express = require('express');
var router = express.Router();
var Bolt = require('misfit-bolt');

/* GET home page. */
router.get('/', function(req, res, next) {
  console.log("---DETECTED BOLTS---");
  const bolts = Bolt.bolts.map((bolt) => {
    console.log('id: ' + bolt.id);
    return {
      id: bolt.id,
    };
  });

  if (bolts.length > 0) {
    bolt = Bolt.get(bolts[0].id);
    res.render('index', { title: 'Express', color: '[0, 255, 0, 100]' });
  } else {
    res.render('index', { title: 'Express' });
  }
});

module.exports = router;
