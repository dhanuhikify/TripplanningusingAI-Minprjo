import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, MapPin, Calendar, Users, IndianRupee, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import Navigation from '@/components/Navigation';
import type { User } from '@supabase/supabase-js';

interface Trip {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget: number | null;
  travelers: number;
  preferences: string[];
  ai_itinerary: any;
  status: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setUser(user);
      await fetchTrips();
    } catch (error) {
      console.error('Error checking user:', error);
      navigate('/auth');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrips = async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching trips",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: Trip['status']) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground';
      case 'planned': return 'bg-primary text-primary-foreground';
      case 'active': return 'bg-success text-success-foreground';
      case 'completed': return 'bg-accent text-accent-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation showBack />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation showBack />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Welcome back, {user?.user_metadata?.display_name || user?.email}!
          </h1>
          <p className="text-muted-foreground">
            Ready for your next adventure? Plan a new trip or continue where you left off.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <Button
            size="lg"
            onClick={() => navigate('/plan')}
            className="bg-gradient-hero text-white shadow-travel hover:shadow-glow transition-smooth"
          >
            <Plus className="w-5 h-5 mr-2" />
            Plan New Trip
          </Button>
        </div>

        {/* Trips Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {trips.length === 0 ? (
            <Card className="md:col-span-2 lg:col-span-3 bg-gradient-card border-border/50 shadow-card-travel">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MapPin className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No trips yet</h3>
                <p className="text-muted-foreground text-center mb-6">
                  Start planning your first adventure with our AI-powered trip planner
                </p>
                <Button
                  onClick={() => navigate('/plan')}
                  className="bg-primary hover:bg-primary/90 transition-smooth"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Plan Your First Trip
                </Button>
              </CardContent>
            </Card>
          ) : (
            trips.map((trip) => (
              <Card
                key={trip.id}
                className="bg-gradient-card border-border/50 shadow-card-travel hover:shadow-glow transition-smooth cursor-pointer"
                onClick={() => navigate(`/trip/${trip.id}`)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{trip.title}</CardTitle>
                    <Badge className={getStatusColor(trip.status)}>
                      {trip.status}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {trip.destination}
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 mr-2" />
                      {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-2" />
                        {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}
                      </div>
                      
                      {trip.budget && (
                        <div className="flex items-center">
                          <IndianRupee className="w-4 h-4 mr-1" />
                          ₹{trip.budget}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-end pt-2">
                      <ArrowRight className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;