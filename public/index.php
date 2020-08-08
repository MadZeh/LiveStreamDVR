<?php

require_once __DIR__ . '/../vendor/autoload.php';

use App\Controller\AboutController;
use App\Controller\DashboardController;
use App\Controller\HookController;
use App\Controller\CutController;
use App\Controller\PlayerController;
use App\TwitchConfig;
use App\TwitchHelper;
use DI\Container;
use Slim\Factory\AppFactory;
use Slim\Views\Twig;
use Slim\Views\TwigMiddleware;
use Twig\Extension\DebugExtension;
use Twig\TwigFilter;

use Slim\Psr7\Request;
use Slim\Psr7\Response;

// Create Container
$container = new Container();
AppFactory::setContainer($container);

// Create Twig
// Set view in Container

$twigConfig = Twig::create( __DIR__ . '/../templates', [
    'cache' => false,
    'debug' => true
]);

$container->set('view', function () use ($twigConfig) {
    return $twigConfig;
});

$container->set( Twig::class, $twigConfig );

// Create App
$app = AppFactory::create();

// Add Twig-View Middleware
$app->add(TwigMiddleware::createFromContainer($app));

// config available everywhere
$container->get('view')->getEnvironment()->addGlobal('config', TwitchConfig::$config);

// test
$container->get('view')->getEnvironment()->addFilter(new TwigFilter('formatBytes', function ($string) {
    return TwitchHelper::formatBytes($string);
}));

$container->get('view')->getEnvironment()->addExtension(new DebugExtension());

// Define named route
$app->get('/', function (Request $request, Response $response, array $args) {
    header("Location: /dashboard");
})->setName('index');

$app->get('/dashboard', DashboardController::class . ':dashboard')->setName('dashboard');
$app->get('/about', AboutController::class . ':about')->setName('about');
$app->get('/player', PlayerController::class . ':player')->setName('player');
$app->get('/cut', CutController::class . ':cut')->setName('cut');
$app->get('/hook.php', HookController::class . ':hook')->setName('hook');

$app->get('/settings', function ($request, $response, $args) {
    return $this->get('view')->render($response, 'settings.twig', [
        'streamers' => TwitchConfig::getStreamers(),
    ]);
})->setName('settings');

// Run app
$app->run();
// TODO: make routes and views
